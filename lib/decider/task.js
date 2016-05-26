var _ = require('underscore');
var dot = require('dot-component');
var util = require('util');
var retry = require('./retryStrategies');
var EventList = require('./eventList');
var Task = function (config) {
  _.extend(this, config);

  if (!this.retryStrategy) {
    this.retryStrategy = new retry.None();
  }

  // Only end of life event handlers can be registered.  Any other
  // can cause incorrect behavior with the task processing.
  this._eventHandlers = {};
};

var actions = require('./actions');

/**
 * Populate an input object with dynamic data from previous events
 * @param  {Object|String} data      Data to populate
 * @param  {EventList} eventlist The previous event list
 * @return {mixed}           The populated object
 */
var populateDynamicConfig = function (data, eventlist) {
  if (_.isString(data)) {
    if (data[0] === '$') {
      var key = data.substr(1).split('.');
      var lastEvent;

      // Pass info from WorkflowExecutionStarted event
      if (key[0] === '$Workflow') {
        var evt = _.findWhere(eventlist, {
          type: 'WorkflowExecutionStarted'
        });
        if (evt) {
          lastEvent = evt;
        } else {
          return null;
        }
        // Otherwise get data from identified event by activityId/name
      } else {
        var events = eventlist.getEventsForTaskName(key[0]);
        if (!events.length) {
          return null;
        }
        lastEvent = events[events.length - 1];
      }

      var output = lastEvent.getOutput();

      if (!_.isObject(output)) {
        // We can't do anything unless key length is 1
        if (key.length === 1) {
          return output;
        } else {
          throw new Error('Output from ' + JSON.stringify(key) + ' is not an object - cannot access using dot notation! (got <' +
            JSON.stringify(output) + '>) (data: ' + data + ')');
        }
      } else {
        if (key.length === 1) {
          return output;
        }
        return dot.get(output, key.slice(1).join('.'));
      }
    } else {
      return data;
    }
  } else if (_.isObject(data)) {
    var newObj = {};
    for (var k in data) {
      if (data.hasOwnProperty(k)) {
        newObj[k] = populateDynamicConfig(data[k], eventlist);
      }
    }
    return newObj;
  }

  return data;
};

/**
 * Registers a function that runs when a failure event is found.  The event
 * handler can return a list of actions or tasks to be run, a single action or
 * task, or null.  The handler will be called with the arguments
 * `(eventThatTriggeredTheHandler, eventListForThisTask, fullWorkflowEventList)`.
 *
 * The `eventThatTriggeredTheHandler` includes a method, `parseProperty(text)`,
 * that returns the parsed dynamic property from the full event history.
 */
Task.prototype.onFailed = function (func) {
  this._eventHandlers['Failed'] = func;
  return this;
};

/**
 * Registers a function that runs when a completed event is found.  The event
 * handler can return a list of actions or tasks to be run, a single action or
 * task, or null.  The handler will be called with the arguments
 * `(eventThatTriggeredTheHandler, eventListForThisTask, fullWorkflowEventList)`.
 *
 * The `eventThatTriggeredTheHandler` includes a method, `parseProperty(text)`,
 * that returns the parsed dynamic property from the full event history.
 */
Task.prototype.onCompleted = function (func) {
  this._eventHandlers['Completed'] = func;
  return this;
};

/**
 * Registers a function that runs when a canceled event is found.  The event
 * handler can return a list of actions or tasks to be run, a single action or
 * task, or null.  The handler will be called with the arguments
 * `(eventThatTriggeredTheHandler, eventListForThisTask, fullWorkflowEventList)`.
 *
 * The `eventThatTriggeredTheHandler` includes a method, `parseProperty(text)`,
 * that returns the parsed dynamic property from the full event history.
 */
Task.prototype.onCanceled = function (func) {
  this._eventHandlers['Canceled'] = func;
  return this;
};

/**
 * This function gets called if the previous task ran successfully (in a series pipeline)
 * or if the parallel pipeline has begun.
 * It will keep being called until there is a "done" event for this task:
 * * "ActivityTaskCompleted"
 * * "TimerFired"
 * * "ChildWorkflowExecutionCompleted"
 *
 * The action can be one of the following:
 *
 * * ScheduleAction     - if the task needs to be scheduled for the first time
 * * RetryAction        - if the task needs to be retried. Could be the same as
 *                         "ScheduleAction" if there is no delay,
 *                        but will start a Timer if there is a delay
 * * FatalErrorAction   - if there was some configuration error that led to a fatal error.
 *                        Meaning, we cannot continue without some manual intervention at
 *                        the code or configuration level to fix it.
 * *
 */
Task.prototype.getNextActions = function (eventlist, afterEventId) {
  var events = eventlist.getEventsForTaskName(this.name);

  if (afterEventId) {
    // Need to make it back into an eventlist
    events = new EventList(events.filter(function (evt) {
      return evt.getEventId() > afterEventId;
    }));
  }
  var backoffEvents = eventlist.getEventsForTaskName(this.name + '__backoff');

  // No events - schedule
  if (events.length === 0) {
    return [this._getScheduleAction(eventlist)];
  }

  // Get the last event. That's the one we want to react to. Can't pop because we need
  // it to calculate total failures below
  var lastEvent = events[events.length - 1];

  var lastBackoffEvent = null;
  if (backoffEvents.length > 0) {
    lastBackoffEvent = backoffEvents.pop();
    if (lastBackoffEvent.timestamp.isAfter(lastEvent.timestamp)) {
      lastEvent = lastBackoffEvent;
    }
  }

  var ret = this._handleLastEvent(lastEvent, events, eventlist);
  if (ret) {
    return ret;
  }

  // If we got to here, something's wrong, because we should have handled all cases. Throw an error?
  throw new Error(`Unhandled event case: ${lastEvent.type}`);
};


Task.prototype._handleLastEvent = function (lastEvent, events, eventlist) {
  return (
    // If there is a specific event handler for this event, use that response.
    this._processEventHandlers(lastEvent, events, eventlist) ||
    // Finally, use the parent's actions.
    this._processLastEvent(lastEvent, events, eventlist) ||

    null);
};


Task.prototype._processLastEvent = function (lastEvent, events, eventlist) {
  if (lastEvent.isFatal()) {
    return [new actions.FatalErrorAction(lastEvent.attributes.cause)];
  }

  // It started, but it hasn't been finished yet. Do nothing.
  if (lastEvent.isStarted() || lastEvent.isScheduled()) {
    return [new actions.Noop()];
  }

  if (lastEvent.isCompleted()) {
    // If it's a backoff event, we want to schedule the next retry action
    if (lastEvent.isBackoff()) {

      return [this._getRetryAction(eventlist, events.getTotalFailuresOrTimeouts(), lastEvent)];
    }

    // Otherwise, the actual task is done, so we don't have anything more to do.
    // We need to return the eventId of the last id for Series pipelines so they
    // can use it to calculate sequential order.
    var toReturn = [];
    toReturn.lastEventId = lastEvent.getEventId();
    return toReturn;
  }
  
  if (lastEvent.isCanceled()) {
    // Consider this to be canceling whatever activity was run.  This does
    // not implicitly cause a failure.
    var toReturn = [];
    toReturn.lastEventId = lastEvent.getEventId();
    return toReturn;
  }

  if (lastEvent.isFailure() || lastEvent.isTimeout()) {
    return [this._getRetryAction(eventlist, events.getTotalFailuresOrTimeouts(), lastEvent)];
  }

  return null;
};


Task.prototype._getScheduleAction = function (eventlist) {

  switch (this.type) {
  case 'activity':
    var options = {
      version: this.activityVersion,
      typeName: this.activityType
    };

    if (this.timeouts) {
      _.extend(options, {
        scheduleToStartTimeout: this.timeouts.scheduleToStart,
        scheduleToCloseTimeout: this.timeouts.scheduleToClose,
        startToCloseTimeout: this.timeouts.startToClose,
        heartbeatTimeout: this.timeouts.heartbeat
      });
    }
    return new actions.ScheduleAction(this.name, populateDynamicConfig(this.input, eventlist), options);
  case 'timer':
    return new actions.TimerAction(this.name, populateDynamicConfig(this.delay, eventlist));
  case 'childWorkflow':
    return new actions.ChildWorkflowAction(this.name, this.workflowName, this.workflowVersion, this.input);
  case 'lambda':
    var options = {};
    if (this.timeouts) {
      options.startToCloseTimeout = this.timeouts.startToCloseTimeout || null;
    }
    return new actions.ScheduleLambdaAction(this.name, this.functionName, populateDynamicConfig(this.input, eventlist), options);
  case 'marker':
    return new actions.RecordMarkerAction(this.name, populateDynamicConfig(this.details, eventlist));
  default:
    throw new Error('Invalid activity type "' + this.type + '"');
  }

  throw new Error('Invalid task type (' + this.type + ')');
};

Task.prototype._getRetryAction = function (eventlist, previousFailures, lastEvent) {
  // Look at retry logic for the config
  if (this.retryStrategy.shouldRetry(previousFailures)) {
    var wait;
    if (lastEvent.isBackoff()) {
      // This is the end of the backoff timer. So set wait to 0 so we can reschedule;
      wait = 0;
    } else {
      wait = this.retryStrategy.getBackoffTime(previousFailures);
    }
    if (wait > 0) {
      // Add a timer for backoff that will trigger the next try asynchronously
      return new actions.TimerAction(this.name + '__backoff', wait);
    } else {
      return this._getScheduleAction(eventlist);
    }
  } else {
    // No more retries.
    return new actions.FatalErrorAction('Retry limit reached.');
  }
};

Task.prototype.mostRecentFirstEvent = function (eventlist) {
  return eventlist.getMostRecentEventByName(this.name, 'started');
};

Task.prototype.mostRecentLastEvent = function (eventlist) {
  return eventlist.getMostRecentEventByName(this.name, 'completed');
};


/**
 * Iterate through each registered event handler for the given eventName.
 * The first one to return a non-empty list wins.
 */
Task.prototype._processEventHandlers = function (lastEvent, events, eventlist) {
  // Allow for the tasks to easily pull data from past events.
  lastEvent.parseProperty = function (text) {
    return populateDynamicConfig(text, eventlist);
  };

  var handler = this._eventHandlers[lastEvent.getActionType()];
  var ret = null;
  if (handler) {
    ret = handler(lastEvent, events, eventlist);
  }
  if (ret) {
    if (!Array.isArray(ret)) {
      ret = [ret];
    }
    if (ret.length <= 0) {
      ret = null;
    }
  }
  return ret;
};



module.exports = Task;
