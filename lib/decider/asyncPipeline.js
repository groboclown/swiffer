const util = require('util');
const _ = require('underscore');
const actions = require('./actions');
const Task = require('./task');
const pipeline = require('./pipeline');

/**
 * A collection of tasks and signals to simulate an actvitiy run without
 * an activity processor.  The state of the pipeline is stored in the
 * workflow as a marker with the pipeline's name as the marker name.
 *
 * @param {Object} p - named parameters
 * @param {string} p.name - name of the pipeline.
 * @param {string} p.functionName - name of the lambda function to invoke.
 * @param {string} p.input - input data for the lambda function.
 *    This must be either an object or a JSON-ified string or a dynamic
 *    reference to an object, because additional data will be added to it
 *    so that the lambda can have all the necessary information to send
 *    signals back to the pipeline.
 * @param {string} [p.lambdaStartToCloseTimeout] - start to close timeout for
 *    the lambda.  Defaults to `300`.
 * @param {long} [p.startToCloseTimeout] - total time (in seconds) from when
 *    the spawned activity starts to when it is considered timed out.
 *    Defaults to `300`.
 * @param {long} [p.scheduleToStartTimeout] - time (in seconds) allowed to
 *    wait between when the lambda finishes running to when the signal from the
 *    activity is encountered.  If this time is exceeded, then the pipeline is
 *    considered timed out.  Defaults to `300`.
 * @param {RetryStrategy} [p.retryStrategy] - retry strategy for the lambda.
 */
var AsyncPipeline = function(p) {
  var self = this;
  this.name = p.name;
  var functionName = p.functionName;
  var input = p.input;
  var lambdaStartToCloseTimeout = p.lambdaStartToCloseTimeout || 300;
  var startToCloseTimeout = p.startToCloseTimeout || 300;
  var scheduleToStartTimeout = p.scheduleToStartTimeout || 300;
  var retryStrategy = p.retryStrategy || null;

  this._signalStartedName = this.name + '__started';
  this._signalCompletedName = this.name + '__completed';
  this._signalFailedName = this.name + '__failed';
  this._signalHeartbeatName = this.name + '__heartbeat';

  // Construct the initial pipeline.  We will need one extra bit
  // of change-up right before we actually return the list of actions.
  var stateName = this.name;
  this._stateName = stateName;
  var lambdaName = this.name + '__lambda';
  var scheduleToStartTimerName = this.name + '__scheduleToStartTimeout';
  var startToCloseTimerName = this.name + '__startToCloseTimeout';

  pipeline.Series.call(this, [

    // First, we create the state marker, and start the lambda execution.
    // Timeouts here are handled by the AWS lambda timeouts.
    new Task({
      type: 'lambda',
      name: lambdaName,
      functionName: functionName,
      input: input,
      timeouts: {
        startToCloseTimeout: lambdaStartToCloseTimeout,
      },
      retryStrategy: retryStrategy,

      // Include these actions before queueing the lambda task
      scheduleActions: [
        new actions.RecordMarkerAction(stateName, {
          state: 'Initiated',
        }),
      ],
    }),

    // Lambda has completed.

    // Next up, we mark the state and start the schedule timeout timer.
    // We require timers because they give us a tie-in to when the
    // whole task is completed - a timer is considered completed when
    // it is canceled or fired.
    // This timer is canceled by a signal to the pipeline.
    new Task({
      type: 'timer',
      name: scheduleToStartTimerName,
      delay: scheduleToStartTimeout,

      // Set the state before the timer is created.
      scheduleActions: [
        new actions.RecordMarkerAction(stateName, {
          state: 'Scheduled',
        }),
      ]
    })
    // When the timer finishes, we need to check if it's actually a failure
    // situation before timing out the activity.
    .onCompleted(function (evt, events, eventlist) {
      var state = getState(stateName, eventlist);
      if (state === 'Scheduled' && evt.type === 'TimerFired') {
        // The timer fired before the activity started.
        return [
          new actions.RecordMarkerAction(stateName, {
            state: 'TimedOut',
            details: 'SCHEDULE_TIMEOUT',
          }),
          new actions.FatalErrorAction('TimedOut', 'SCHEDULE_TIMEOUT'),
        ];
      }
      // Continue on with the workflow.
      return [];
    }),

    // If the timer completed without an error (either canceled or fired),
    // then the next state begins.

    // Start the wait-for-completion timer.

    new Task({
      type: 'timer',
      name: startToCloseTimerName,
      delay: startToCloseTimeout,

      // Set the state before the timer runs
      scheduleActions: [
        new actions.RecordMarkerAction(stateName, {
          state: 'Started',
        }),
      ]
    }).onCompleted(function (evt, events, eventlist) {
      var state = getState(stateName, eventlist);
      if (state === 'Started' && evt.type === 'TimerFired') {
        // The timer fired before  the activity started.
        return [
          new actions.RecordMarkerAction(stateName, {
            state: 'TimedOut',
            details: 'STARTED_TIMEOUT'
          }),
          new actions.FatalErrorAction('TimedOut', 'STARTED_TIMEOUT')
        ];
      }

      // The timer completed by either firing in the not-started state, or
      // by being canceled.  The state is set by the signal.
      // (Note that we can't set the state here, because that will mess up
      // the event processing - the system will think that this started
      // something, and the next task after this pipeline won't ever run.)

      return [];
    })
  ]);

  // Signals - the pipeline uses signals from the asynchronous activity
  // to tell us when things happen.

  // The Activity Started
  this.onSignal(this._signalStartedName, {
    // A simulated task.  We use the state to keep ourselves honest.
    getNextActions: function (eventlist, fromEventId) {
      // The activity started.  Now we can cancel the timer and set the state.

      var ret = [];

      // Canceling the timer will cause the main pipeline list of tasks
      // to continue running.
      ret = ret.concat(cancelTimer(scheduleToStartTimerName, eventlist));

      // The state is set when the next timer starts.

      return ret;
    },
    mostRecentFirstEvent: function () { return null; },
    mostRecentLastEvent: function () { return null; }
  });

  // The Activity Completed without noticing errors.
  this.onSignal(this._signalCompletedName, {
    getNextActions: function (eventlist, fromEventId) {

      // This needs to be flexible enough to run at all times, and only
      // generate the actions when it needs to be run.
      // Here, we set the state if it is in a running state AND if the
      // timer is canceled.

      var ret = [];
      ret = ret.concat(cancelTimer(scheduleToStartTimerName, eventlist)); // Just in case
      ret = ret.concat(cancelTimer(startToCloseTimerName, eventlist));

      var signalEvent = eventlist.getMostRecentEventByName(self._signalCompletedName);

      if (isRunningState(getState(stateName, eventlist)) && ret.length > 0) {
        // Add the marker to the start of the actions.
        ret.unshift(new actions.RecordMarkerAction(stateName, {
          state: 'Completed',
          result: signalEvent.getOutput()
        }));
      }

      return ret;
    },
    mostRecentFirstEvent: function () { return null; },
    mostRecentLastEvent: function () { return null; }
  });


  this.onSignal(this._signalFailedName, {
    getNextActions: function (eventlist, fromEventId) {

      // This needs to be flexible enough to run at all times, and only
      // generate the actions when it needs to be run.
      // Here, we set the state if it is in a running state AND if the
      // timer is canceled.

      var ret = [];
      ret = ret.concat(cancelTimer(scheduleToStartTimerName, eventlist)); // Just in case
      ret = ret.concat(cancelTimer(startToCloseTimerName, eventlist));

      var signalEvent = eventlist.getMostRecentEventByName(self._signalFailedName);

      if (isRunningState(getState(stateName, eventlist)) && ret.length > 0) {
        var output = signalEvent.getOutput() || {};
        ret.unshift(new actions.RecordMarkerAction(stateName, {
          state: 'Failed',
          result: output.result,
          message: output.message,
          details: output.details,
          reason: output.reason,
          cause: output.cause,
          all: output
        }));
      }

      return ret;
    },
    mostRecentFirstEvent: function () { return null; },
    mostRecentLastEvent: function () { return null; }
  });
};
util.inherits(AsyncPipeline, pipeline.Series);

AsyncPipeline.prototype.getNextActions = function (eventlist) {
  var self = this;
  // Quick check to ensure the workflowExecution was carried over from
  // the decider.
  if (!eventlist.workflowExecution) {
    throw new Error('No workflowExecution on eventlist');
  }

  // Before we can do anything for the actions, we need to see if this
  // particular pipeline is completed or not.

  var stateData = getStateData(this._stateName, eventlist);
  var state = getStateFromData(stateData);

  if (isFailedState(state)) {
    // The pipeline failed.
    return [
      new actions.FatalErrorAction(state,
        stateData.reason ||
        stateData.details ||
        stateData.cause ||
        stateData.timeoutType)
    ];
  }

  if (isCompletedState(state)) {
    // The pipeline is complete.
    return [];
  }

  var nextActions = pipeline.Series.prototype.getNextActions.call(this, eventlist);

  // If one of the responses is the lambda invocation, then change the
  // input to include the workflow and signal information.

  nextActions.forEach(function (a) {
    if (!!a && a instanceof actions.ScheduleLambdaAction) {
      a._input = JSON.parse(a._input || '{}');
      a._input.async = {
        workflowExecution: eventlist.workflowExecution,
        signals: {
          started: self._signalStartedName,
          completed: self._signalCompletedName,
          failed: self._signalFailedName,
          heartbeat: self._signalHeartbeatName
        }
      };
      a._input = JSON.stringify(a._input);
    }
  });
  
  return nextActions;
};

function getStateData(stateName, eventlist) {
  var stateEvents = eventlist.getEventsForTaskName(stateName);
  var data = {
    state: 'Not Started'
  };
  if (stateEvents.length > 0) {
    data = stateEvents[stateEvents.length - 1].getOutput() || data;
  }
  return data;
}

function getState(stateName, eventlist) {
  var data = getStateData(stateName, eventlist);
  return getStateFromData(data);
}

function getStateFromData(stateData) {
  stateData = stateData || {};
  return stateData.state || 'Not Started';
}

function isRunningState(state) {
  return (state !== 'Not Started' && state !== 'Initiated' && state !== 'Scheduled');
}

function isCompletedState(state) {
  return state === 'Completed';
}

function isFailedState(state) {
  return state === 'Failed' || state === 'TimedOut';
}

/**
 * Conditionally cancel a timer only if it is active (started but not fired or
 * canceled).
 *
 * @return {[action]} list of actions for canceling the timer.
 */
function cancelTimer(timerName, eventlist) {
  var ret = [];
  var startedEvent = eventlist.getMostRecentEventByName(timerName, 'started');
  var completedEvent = eventlist.getMostRecentEventByName(timerName, 'completed');
  var canceledEvent = eventlist.getMostRecentEventByName(timerName, 'canceled');
  if (!!startedEvent && !completedEvent && !canceledEvent) {
    ret.push(new actions.CancelTimerAction(startedEvent));
  }
  return ret;
}


module.exports = AsyncPipeline;
