const util = require('util');
const _ = require('underscore');
const actions = require('./actions');
const Task = require('./task');
const pipeline = require('./pipeline');

/*

Async Pipeline Workflow:

Maintains a marker that stores the state of the pipeline.  The marker
has the name of the workflow.

Start:
    - Set the marker's state to 'Initiated'
    - Schedule the lambda function.  Include into the input extra
      information about the workflow, so that the activity can send signals
      back.
Lambda runs:
    - Lambda launches the activity.
    - If, before the lambda exits, the started signal is received:
        - Set the state to 'Started'
        - Make sure the schedule-to-start timer doesn't start.
        - Start the start-to-close timer.
    - If, before the lambda exits, a finished signal (completed, failed) is
      received:
        - Set the state to 'Completed' or 'Failed', with the correct exit
          information.
        - Make sure the start-to-close timer doesn't start.
            - Potential hole - if the signal to
            start the timer was sent,
              but the receipt of the timer started hasn't been received yet,
              then the timer will be running.
        - Ensure the schedule-to-start timer is canceled, if it started
          (it shouldn't have).
    - When lambda finishes:
        - If the state is 'Initiated', change the state to 'Scheduled',
          and start the ScheduleToStart Timeout timer.
        - If the state is 'Scheduled', start the schedule-to-start Timeout
          timer.
    - If the schedule-to-start Timeout timer fires:
        - If the state is 'Scheduled', then set the state of the task as Failed
          due to Time Out, and fail the workflow as Timed Out.
        - Otherwise, ignore the timeout.
    - If the Started signal is received:
        - If the state of the workflow is not finished, then mark the workflow
          as Started, cancel the schedule-to-start Timeout timer, and start the
          start-to-close Timeout timer.
    - If the start-to-close Timeout timer fires:
        - If the state of the workflow is not finished, then mark the workflow
          as Failed due to Time Out, and fail the workflow as Timed Out.
    - If the Completed signal is received:
        - If  the state of the workflow is not finished, then mark the workflow
          as Completed with the signal's results, cancel any running timer, and
          complete the async pipeline.
    - If the Failed signal is received:
        - If the state of the workflow is not finished, then mark the workflow
          as Failed with the signal's reasons, cancel any running timer,
          and fail the workflow with the
          same reasons.
        
(Document the series of events and timers, and how they work together.)

*/

// State of the pipeline
const PIPELINE_NOT_STARTED = 'Not Started';
const PIPELINE_INITIATED = 'Initiated';
const PIPELINE_SCHEDULED = 'Scheduled';
const PIPELINE_STARTED = 'Started';
const PIPELINE_TIMED_OUT = 'Timed Out';
const PIPELINE_COMPLETED = 'Completed';
const PIPELINE_FAILED = 'Failed';

const PIPELINE_ACTIVE_STATES = [
  PIPELINE_SCHEDULED,
  PIPELINE_STARTED
];

const PIPELINE_FINISHED_STATES = [
  PIPELINE_TIMED_OUT,
  PIPELINE_COMPLETED,
  PIPELINE_FAILED
];

const PIPELINE_FAILED_STATES = [
  PIPELINE_TIMED_OUT,
  PIPELINE_FAILED
];


/**
 * A collection of tasks and signals to simulate an actvitiy run without
 * an activity processor.  The state of the pipeline is stored in the
 * workflow as a marker with the pipeline's name as the marker name.
 *
 * Note that the pipeline works best as a child workflow.  As a child workflow,
 * the activity that sends signals will receive errors if it posts signals
 * to the workflow when the workflow is completed.  That is, if an external
 * user forces the workflow to stop, or if one of the timers causes the
 * activity to time out.
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
  var scheduleToCloseTimeout = p.scheduleToCloseTimeout || 300; // Note: not currently used.
  var heartbeatTimeout = p.heartbeatTimeout || 'NEVER'; // Note: not currently used.
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
  this._scheduleToStartTimerName = scheduleToStartTimerName;
  var startToCloseTimerName = this.name + '__startToCloseTimeout';
  this._startToCloseTimerName = startToCloseTimerName;

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
          state: PIPELINE_INITIATED,
        }),
      ],
    })
    .onCompleted(function (evt, taskEvents, eventlist) {
      // Lambda has completed.
      // Next up, we mark the state and start the schedule timeout timer.
      // We require timers because they give us a tie-in to when the
      // whole task is completed - a timer is considered completed when
      // it is canceled or fired.
      
      // We must do these in an onCompleted function, because we don't want to
      // schedule the timers if the signals have already been received.
      // If the signals fired, then the pipeline moved to the
      // next state, so we don't want to wait around for a timer that will never
      // be canceled.
      
      var state = getState(stateName, eventlist);
      
      var ret = [];
      if (state === PIPELINE_INITIATED) {
        // Switch to a scheduled state, so that we can start the timer.
        state = PIPELINE_SCHEDULED;
        ret.push(new actions.RecordMarkerAction(stateName, {
          state: PIPELINE_SCHEDULED,
        }));
      }
      
      if (state === PIPELINE_SCHEDULED) {
        // This timer is canceled by a signal to the pipeline.
        ret.push(new Task({
          type: 'timer',
          name: scheduleToStartTimerName,
          delay: scheduleToStartTimeout,
        })
        // When the timer finishes, we need to check if it's actually a failure
        // situation before timing out the activity.
        .onCompleted(function (evt, events, eventlist) {
          var state = getState(stateName, eventlist);
          if (state === PIPELINE_SCHEDULED && evt.type === 'TimerFired') {
            // The timer fired before the activity started.
            return [
              new actions.RecordMarkerAction(stateName, {
                state: PIPELINE_TIMED_OUT,
                details: 'SCHEDULE_TIMEOUT',
              }),
              new actions.FatalErrorAction('TimedOut', 'SCHEDULE_TIMEOUT'),
            ];
          }
          // Continue on with the workflow.
          return [];
        }));
      }
      
      // The follow-up timer, for when the activity marks that it is running
      // by sending the started signal, is created in the signal's processing.
      
      
      return ret;
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

      // Check if a finished signal was created.  If so, then
      // this shouldn't do anything.  This will avoid the weird state where
      // the activity runs completely before the lambda has a chance to finish.
      // Without this check, then an extra timer will be created that will just
      // time out on its own, possibly after the workflow completes.
      var completedSignalEvent = eventlist.getMostRecentEventByName(self._signalCompletedName);
      var failedSignalEvent = eventlist.getMostRecentEventByName(self._signalFailedName);
      if (completedSignalEvent || failedSignalEvent) {
        return ret;
      }

      
      var state = getState(stateName, eventlist);
      if (!isFinishedState(state) && state !== PIPELINE_STARTED) {
        // Set the state before the timer is canceled.  This way,
        // when the lambda completed code runs again (it happens each time
        // the decider notices that the lambda completed), it will cause the
        // correct timer to fire.  We don't want the 'schedule' timer to
        // fire if this signal is encountered before the timer is created.
        
        // Adding this marker will cause the decision processing to not move
        // to the next step, and thus the follow-up timer will never be
        // added.
        ret.push(new actions.RecordMarkerAction(stateName, {
          state: PIPELINE_STARTED,
        }));
      }

      // Canceling the timer will cause the main pipeline list of tasks
      // to continue running.
      ret = ret.concat(cancelTimer(scheduleToStartTimerName, eventlist));
      
      // Because this signal was encountered, we will need to move on
      // to adding the wait-for-completion timer.  This needs to be added
      // here, because if the new Started state was added, it won't be
      // started otherwise (it's how the Series pipeline logic works - if
      // something returns an action, then nothing else in the list will be
      // called).
        
      if (!isFinishedState(state)) {
        // Start the wait-for-completion timer.
        ret.push(new Task({
          type: 'timer',
          name: startToCloseTimerName,
          delay: startToCloseTimeout,
        })
        .onCompleted(function (evt, events, eventlist) {
          var state = getState(stateName, eventlist);
          if (state === PIPELINE_STARTED && evt.type === 'TimerFired') {
            // The timer fired before the activity finished.
            return [
              new actions.RecordMarkerAction(stateName, {
                state: PIPELINE_TIMED_OUT,
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
        );
      }

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

      var signalEvent = eventlist.getMostRecentEventByName(self._signalCompletedName);
      if (!isFinishedState(getState(stateName, eventlist))) {
        // Add the marker to the start of the actions.
        ret.push(new actions.RecordMarkerAction(stateName, {
          state: PIPELINE_COMPLETED,
          result: signalEvent.getOutput()
        }));
      }
      
      ret = ret.concat(cancelTimer(scheduleToStartTimerName, eventlist)); // Just in case
      ret = ret.concat(cancelTimer(startToCloseTimerName, eventlist));

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

      var signalEvent = eventlist.getMostRecentEventByName(self._signalFailedName);
      if (!isFinishedState(getState(stateName, eventlist))) {
        var output = signalEvent.getOutput() || {};
        ret.push(new actions.RecordMarkerAction(stateName, {
          state: PIPELINE_FAILED,
          result: output.result,
          message: output.message,
          details: output.details,
          reason: output.reason,
          cause: output.cause,
          all: output
        }));
      }
      
      ret = ret.concat(cancelTimer(scheduleToStartTimerName, eventlist)); // Just in case
      ret = ret.concat(cancelTimer(startToCloseTimerName, eventlist));

      return ret;
    },
    mostRecentFirstEvent: function () { return null; },
    mostRecentLastEvent: function () { return null; }
  });
  
  // TODO: When heartbeat processing is implemented, we would add heartbeat
  // signal recognition here.  Heartbeats would be extra state information
  // (when the heartbeat was last received; defaults to 'NEVER').  When
  // a heartbeat is received, and everything checks out with the state, the
  // last heartbeat timer will be canceled, and the next one will be created.
  // Each one will use the same name (e.g. `control` field).  The creation
  // will need to be a straight-up action, not a Task, so that it doesn't
  // interfere with the standard task processing.  Extra logic would need
  // to be added above, on completion, to cancel the heartbeat timer.
  // Because the heartbeat timer would not be a task object, the timer
  // firing handling would need to be done in the AsyncPipeline.getNextActions
  // method, to explicitly look for that fire event.
  
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
    return this._finishActions(state, [
      new actions.FatalErrorAction(state,
        stateData.reason ||
        stateData.details ||
        stateData.cause ||
        stateData.timeoutType)
    ], eventlist);
  }

  if (isCompletedState(state)) {
    // The pipeline is complete.
    return this._finishActions(state, [], eventlist);
  }

  // Perform normal signal and task order processing.
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


AsyncPipeline.prototype._finishActions = function (state, nextActions, eventlist) {
  
  // If the next actions are empty, then that means the pipeline is finished.
  // However, there's a slim chance that a timer start event came after
  // the events finished.  In that case, we need to cancel all the timers.
  
  if (!hasActionableActions(nextActions) && isFinishedState(state)) {
    nextActions = nextActions.concat(cancelTimer(this._scheduleToStartTimerName, eventlist));
    nextActions = nextActions.concat(cancelTimer(this._startToCloseTimerName, eventlist));
  }
  
  return nextActions;
};


/**
 * @return {Object} the state data from the marker in the event list.
 *     Will not return `null`.
 */
function getStateData(stateName, eventlist) {
  var stateEvents = eventlist.getEventsForTaskName(stateName);
  var data = {
    state: PIPELINE_NOT_STARTED
  };
  if (stateEvents.length > 0) {
    data = stateEvents[stateEvents.length - 1].getOutput() || data;
  }
  return data;
}

/**
 * @return {string} the state of the pipeline from the marker in the event list.
 */
function getState(stateName, eventlist) {
  var data = getStateData(stateName, eventlist);
  return getStateFromData(data);
}

/**
 * @return {string} the state of the pipeline from the marker in the state data.
 */
function getStateFromData(stateData) {
  stateData = stateData || {};
  return stateData.state || PIPELINE_NOT_STARTED;
}

function isActiveState(state) {
  return PIPELINE_ACTIVE_STATES.indexOf(state) > -1;
}

function isCompletedState(state) {
  return state === PIPELINE_COMPLETED;
}

function isFailedState(state) {
  return PIPELINE_FAILED_STATES.indexOf(state) > -1;
}

function isFinishedState(state) {
  return PIPELINE_FINISHED_STATES.indexOf(state) > -1;
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


function hasActionableActions(actions) {
  if (actions) {
    for (var i = 0; i < actions.length; i++) {
      if (!actions[i].nonAction) {
        return true;
      }
    }
  }
  return false;
}


module.exports = AsyncPipeline;
