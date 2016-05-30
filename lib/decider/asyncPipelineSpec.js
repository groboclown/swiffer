var EventList = require('./eventList');
var actions = require('./actions');
var retryStrategies = require('./retryStrategies');
var Task = require('./task');
var AsyncPipeline = require('./asyncPipeline');
var parameters = [

  // Initiate the task.
  {
    pipe: {
      name: 'Initiate task',
      // No input key means construct it in the asyncPipeline
      scheduleToStartTimeout: 10
    },
    list: [], // Empty - start the task
    expect: [
      new actions.RecordMarkerAction('Initiate task', { state: 'Initiated' }),
      new actions.ScheduleLambdaAction('Initiate task__lambda', 'MyLambda', {
        async: {
          workflowExecution: {
            workflowId: 'Initiate task Workflow',
            runId: 'SomeRunId'
          },
          signals: {
            started: 'Initiate task__started',
            completed: 'Initiate task__completed',
            failed: 'Initiate task__failed',
            heartbeat: 'Initiate task__heartbeat'
          }
        }
      }, {
        // Default lambda timeout
        startToCloseTimeout: 300
      })
    ]
  },

  // Fail the lambda, fail the pipeline
  {
    pipe: {
      name: 'Fail the lambda, so the pipeline should fail',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Fail the lambda, so the pipeline should fail',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Fail the lambda, so the pipeline should fail__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'LambdaFunctionFailed',
      lambdaFunctionFailedEventAttributes: {
        reason: 'Test failure',
        details: 'Some details',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }],
    expect: [new actions.FatalErrorAction('Retry limit reached.')]
  },


  // Time out the lambda, fail the pipeline
  {
    pipe: {
      name: 'Time out the lambda, so the pipeline should fail',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Time out the lambda, so the pipeline should fail',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Time out the lambda, so the pipeline should fail__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'LambdaFunctionTimedOut',
      lambdaFunctionTimedOutEventAttributes: {
        timeoutType: 'START_TO_CLOSE',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }],
    expect: [new actions.FatalErrorAction('Retry limit reached.')]
  },


  // Fail to schedule the lambda, fail the pipeline (big time)
  {
    pipe: {
      name: 'Fail to schedule the lambda, so the pipeline should fail',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Fail to schedule the lambda, so the pipeline should fail',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'ScheduleLambdaFunctionFailed',
      scheduleLambdaFunctionFailedEventAttributes: {
        cause: 'OPEN_LAMBDA_FUNCTIONS_LIMIT_EXCEEDED',
        id: 'Fail to schedule the lambda, so the pipeline should fail__lambda',
        name: 'MyLambda'
      }
    }],
    expect: [new actions.FatalErrorAction('OPEN_LAMBDA_FUNCTIONS_LIMIT_EXCEEDED')]
  },


  // Lambda completed, move on to schedule state.
  {
    pipe: {
      name: 'Lambda completed, move on to schedule state',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Lambda completed, move on to schedule state',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Lambda completed, move on to schedule state__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }],
    expect: [
      new actions.RecordMarkerAction('Lambda completed, move on to schedule state', { state: 'Scheduled' }),
      new actions.TimerAction('Lambda completed, move on to schedule state__scheduleToStartTimeout', 300)
    ]
  },


  // Schedule the activity timed out.
  {
    pipe: {
      name: 'Schedule the activity timed out',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Schedule the activity timed out',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Schedule the activity timed out__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }, {
      eventId: 5,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Schedule the activity timed out',
        details: JSON.stringify({
          state: 'Scheduled'
        })
      }
    }, {
      eventId: 6,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Schedule the activity timed out__scheduleToStartTimeout',
        startToFireTimeout: '300',
        timerId: 'abc'
      }
    }, {
      eventId: 7,
      eventType: 'TimerFired',
      timerFiredEventAttributes: {
        startedEventId: 6,
        timerId: 'abc'
      }
    }],
    expect: [
      new actions.RecordMarkerAction('Schedule the activity timed out', { state: 'Timed Out', details: 'SCHEDULE_TIMEOUT' }),
      new actions.FatalErrorAction('TimedOut', 'SCHEDULE_TIMEOUT')
    ]
  },


  // Schedule the activity timed out, then a signal that the activity started.
  {
    pipe: {
      name: 'Schedule the activity timed out, then a signal that the activity started',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Schedule the activity timed out, then a signal that the activity started',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Schedule the activity timed out, then a signal that the activity started__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }, {
      eventId: 5,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Schedule the activity timed out, then a signal that the activity started',
        details: JSON.stringify({
          state: 'Scheduled'
        })
      }
    }, {
      eventId: 6,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Schedule the activity timed out, then a signal that the activity started__scheduleToStartTimeout',
        startToFireTimeout: '300',
        timerId: 'abc'
      }
    }, {
      eventId: 7,
      eventType: 'TimerFired',
      timerFiredEventAttributes: {
        startedEventId: 6,
        timerId: 'abc'
      }
    }, {
      eventId: 8,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaled: {
        input: null,
        signalName: 'Schedule the activity timed out, then a signal that the activity started__started'
      }
    }],
    expect: [
      new actions.RecordMarkerAction('Schedule the activity timed out, then a signal that the activity started', { state: 'Timed Out', details: 'SCHEDULE_TIMEOUT' }),
      new actions.FatalErrorAction('TimedOut', 'SCHEDULE_TIMEOUT')
    ]
  },

  // The activity sent the started signal before the schedule time out.
  {
    pipe: {
      name: 'The activity sent the started signal',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'The activity sent the started signal',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'The activity sent the started signal__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }, {
      eventId: 5,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'The activity sent the started signal',
        details: JSON.stringify({
          state: 'Scheduled'
        })
      }
    }, {
      eventId: 6,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'The activity sent the started signal__scheduleToStartTimeout',
        startToFireTimeout: '300',
        timerId: 'abc'
      }
    }, {
      eventId: 7,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'The activity sent the started signal__started'
      }
    }],
    expect: [
      new actions.RecordMarkerAction('The activity sent the started signal', { state: 'Started' }),
      new actions.CancelTimerAction({ attributes: { timerId: 'abc' } }),
      new actions.TimerAction('The activity sent the started signal__startToCloseTimeout', 300)
    ]
  },

  // Schedule timer canceled due to signal
  {
    pipe: {
      name: 'Schedule timer canceled due to signal',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Schedule timer canceled due to signal',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Schedule timer canceled due to signal__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }, {
      eventId: 5,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Schedule timer canceled due to signal',
        details: JSON.stringify({
          state: 'Scheduled'
        })
      }
    }, {
      eventId: 6,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Schedule timer canceled due to signal__scheduleToStartTimeout',
        startToFireTimeout: '300',
        timerId: 'abc'
      }
    }, {
      eventId: 7,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'Schedule timer canceled due to signal__started'
      }
    }, {
      eventId: 8,
      eventType: 'TimerCanceled',
      timerCanceledEventAttributes: {
        startedEventId: 6,
        timerId: 'abc'
      }
    }],
    expect: [
      new actions.RecordMarkerAction('Schedule timer canceled due to signal', { state: 'Started' }),
      new actions.TimerAction('Schedule timer canceled due to signal__startToCloseTimeout', 300)
    ]
  },

  // Activity completed before start-to-close timeout
  {
    pipe: {
      name: 'Activity completed before start-to-close timeout',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Activity completed before start-to-close timeout',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Activity completed before start-to-close timeout__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }, {
      eventId: 5,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Activity completed before start-to-close timeout',
        details: JSON.stringify({
          state: 'Scheduled'
        })
      }
    }, {
      eventId: 6,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Activity completed before start-to-close timeout__scheduleToStartTimeout',
        startToFireTimeout: '300',
        timerId: 'abc'
      }
    }, {
      eventId: 7,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'Activity completed before start-to-close timeout__started'
      }
    }, {
      eventId: 8,
      eventType: 'TimerCanceled',
      timerCanceledEventAttributes: {
        startedEventId: 6,
        timerId: 'abc'
      }
    }, {
      eventId: 9,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Activity completed before start-to-close timeout',
        details: JSON.stringify({
          state: 'Started'
        })
      }
    }, {
      eventId: 10,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Activity completed before start-to-close timeout__startToCloseTimeout',
        startToFireTimeout: '300',
        timerId: 'qwerty'
      }
    }, {
      eventId: 11,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: 'Lots of data',
        signalName: 'Activity completed before start-to-close timeout__completed'
      }
    }],
    expect: [
      new actions.RecordMarkerAction('Activity completed before start-to-close timeout', { state: 'Completed', result: 'Lots of data' }),
      new actions.CancelTimerAction({ attributes: { timerId: 'qwerty' } }),
    ]
  },

  // Activity failed before start-to-close timeout
  {
    pipe: {
      name: 'Activity failed before start-to-close timeout',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Activity failed before start-to-close timeout',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Activity failed before start-to-close timeout__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }, {
      eventId: 5,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Activity failed before start-to-close timeout',
        details: JSON.stringify({
          state: 'Scheduled'
        })
      }
    }, {
      eventId: 6,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Activity failed before start-to-close timeout__scheduleToStartTimeout',
        startToFireTimeout: '300',
        timerId: 'abc'
      }
    }, {
      eventId: 7,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'Activity failed before start-to-close timeout__started'
      }
    }, {
      eventId: 8,
      eventType: 'TimerCanceled',
      timerCanceledEventAttributes: {
        startedEventId: 6,
        timerId: 'abc'
      }
    }, {
      eventId: 9,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Activity failed before start-to-close timeout',
        details: JSON.stringify({
          state: 'Started'
        })
      }
    }, {
      eventId: 10,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Activity failed before start-to-close timeout__startToCloseTimeout',
        startToFireTimeout: '300',
        timerId: 'qwerty'
      }
    }, {
      eventId: 11,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: {
          reason: 'Big time errors',
          cause: 'causes',
          details: 'reasons',
          other: 'blah'
        },
        signalName: 'Activity failed before start-to-close timeout__failed'
      }
    }],
    expect: [
      new actions.RecordMarkerAction('Activity failed before start-to-close timeout', {
        state: 'Failed',
        details: 'reasons',
        reason: 'Big time errors',
        cause: 'causes',
        all: {
          reason: 'Big time errors',
          cause: 'causes',
          details: 'reasons',
          other: 'blah'
        }
     }),
      new actions.CancelTimerAction({ attributes: { timerId: 'qwerty' } }),
    ]
  },

  // Start-to-close timeout before activity finished
  {
    pipe: {
      name: 'Start-to-close timeout before activity finished',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Start-to-close timeout before activity finished',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Start-to-close timeout before activity finished__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }, {
      eventId: 5,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Start-to-close timeout before activity finished',
        details: JSON.stringify({
          state: 'Scheduled'
        })
      }
    }, {
      eventId: 6,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Start-to-close timeout before activity finished__scheduleToStartTimeout',
        startToFireTimeout: '300',
        timerId: 'abc'
      }
    }, {
      eventId: 7,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'Start-to-close timeout before activity finished__started'
      }
    }, {
      eventId: 8,
      eventType: 'TimerCanceled',
      timerCanceledEventAttributes: {
        startedEventId: 6,
        timerId: 'abc'
      }
    }, {
      eventId: 9,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Start-to-close timeout before activity finished',
        details: JSON.stringify({
          state: 'Started'
        })
      }
    }, {
      eventId: 10,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Start-to-close timeout before activity finished__startToCloseTimeout',
        startToFireTimeout: '300',
        timerId: 'qwerty'
      }
    }, {
      eventId: 11,
      eventType: 'TimerFired',
      timerFiredEventAttributes: {
        startedEventId: 10,
        timerId: 'qwerty'
      }
    }],
    expect: [
      new actions.RecordMarkerAction('Start-to-close timeout before activity finished', {
        state: 'Timed Out',
        details: 'STARTED_TIMEOUT'
      }),
      new actions.FatalErrorAction('TimedOut', 'STARTED_TIMEOUT')
    ]
  },

  // Activity starts before lambda finishes
  {
    pipe: {
      name: 'Activity starts before lambda finishes',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Activity starts before lambda finishes',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Activity starts before lambda finishes__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'Activity starts before lambda finishes__started'
      }
    }],
    expect: [
      // Skip making the schedule-to-start timer.
      new actions.RecordMarkerAction('Activity starts before lambda finishes', {
        state: 'Started'
      }),
      new actions.TimerAction('Activity starts before lambda finishes__startToCloseTimeout', 300)
    ]
  },

  // Activity starts as lambda finishes
  {
    pipe: {
      name: 'Activity starts as lambda finishes',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Activity starts as lambda finishes',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Activity starts as lambda finishes__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'Activity starts as lambda finishes__started'
      }
    }, {
      eventId: 5,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }],
    expect: [
      // Skip making the schedule-to-start timer.
      new actions.RecordMarkerAction('Activity starts as lambda finishes', {
        state: 'Started'
      }),
      new actions.TimerAction('Activity starts as lambda finishes__startToCloseTimeout', 300)
    ]
  },

  // Activity completes before lambda finishes
  {
    pipe: {
      name: 'Activity completes before lambda finishes',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Activity completes before lambda finishes',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Activity completes before lambda finishes__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'Activity completes before lambda finishes__started'
      }
    }, {
      eventId: 5,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: 'Lots of data',
        signalName: 'Activity completes before lambda finishes__completed'
      }
    }],
    expect: [
      // Skip making the timers
      new actions.RecordMarkerAction('Activity completes before lambda finishes', { state: 'Completed', result: 'Lots of data' }),
    ]
  },

  // Activity completes as lambda finishes
  {
    pipe: {
      name: 'Activity completes as lambda finishes',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Activity completes as lambda finishes',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Activity completes as lambda finishes__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'Activity completes as lambda finishes__started'
      }
    }, {
      eventId: 5,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: 'Lots of data',
        signalName: 'Activity completes as lambda finishes__completed'
      }
    }, {
      eventId: 6,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }],
    expect: [
      // Skip making the timers.
      new actions.RecordMarkerAction('Activity completes as lambda finishes', { state: 'Completed', result: 'Lots of data' }),
    ]
  },

  // The start-to-close timer start event happens after the signal to
  // complete the pipeline is received.
  {
    pipe: {
      name: 'Late start-to-close start',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Late start-to-close start',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Late start-to-close start__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'Late start-to-close start__started'
      }
    }, {
      eventId: 5,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Late start-to-close start',
        details: JSON.stringify({
          state: 'Running'
        })
      }
    }, {
      eventId: 6,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Late start-to-close start',
        details: JSON.stringify({
          state: 'Running'
        })
      }
    }, {
      eventId: 7,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: 'Lots of data',
        signalName: 'Late start-to-close start__completed'
      }
    }, {
      eventId: 8,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Late start-to-close start',
        details: JSON.stringify({
          state: 'Completed',
          result: 'Lots of data'
        })
      }
    }, {
      eventId: 9,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }, {
      eventId: 10,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Late start-to-close start__startToCloseTimeout',
        startToFireTimeout: '300',
        timerId: 'typer'
      }
    }],
    expect: [
      // Cancel the timer.
      new actions.CancelTimerAction({ attributes: { timerId: 'typer' } }),
    ]
  },

  // The start-to-close timer start event happens after the signal to
  // complete the pipeline is received.  In this case, the lambda finishes
  // at the very end.
  {
    pipe: {
      name: 'Late start-to-close start lambda last',
    },
    list: [{
      eventId: 1,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Late start-to-close start lambda last',
        details: JSON.stringify({
          state: 'Initiated'
        })
      }
    }, {
      eventId: 2,
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'Late start-to-close start lambda last__lambda',
      }
    }, {
      eventId: 3,
      eventType: 'LambdaFunctionStarted',
      lambdaFunctionStartedEventAttributes: {
        scheduledEventId: 2
      }
    }, {
      eventId: 4,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: null,
        signalName: 'Late start-to-close start lambda last__started'
      }
    }, {
      eventId: 5,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Late start-to-close start lambda last',
        details: JSON.stringify({
          state: 'Running'
        })
      }
    }, {
      eventId: 6,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Late start-to-close start lambda last',
        details: JSON.stringify({
          state: 'Running'
        })
      }
    }, {
      eventId: 7,
      eventType: 'WorkflowExecutionSignaled',
      workflowExecutionSignaledEventAttributes: {
        input: 'Lots of data',
        signalName: 'Late start-to-close start lambda last__completed'
      }
    }, {
      eventId: 8,
      eventType: 'MarkerRecorded',
      markerRecordedEventAttributes: {
        markerName: 'Late start-to-close start lambda last',
        details: JSON.stringify({
          state: 'Completed',
          result: 'Lots of data'
        })
      }
    }, {
      eventId: 9,
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Late start-to-close start lambda last__startToCloseTimeout',
        startToFireTimeout: '300',
        timerId: 'typer'
      }
    }, {
      eventId: 10,
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'data',
        scheduledEventId: 2,
        startedEventId: 3
      }
    }],
    expect: [
      // Cancel the timer.
      new actions.CancelTimerAction({ attributes: { timerId: 'typer' } }),
    ]
  }
];

describe('AsyncPipeline', function () {
  parameters.forEach(function (param, idx) {
    it(param.pipe.name + ' - parameterized - #' + idx.toString(), function () {
      var asyncPipe = new AsyncPipeline({
        name: param.pipe.name,
        functionName: 'MyLambda',
        lambdaStartToCloseTimeout: param.pipe.lambdaStartToCloseTimeout,
        startToCloseTimeout: param.pipe.startToCloseTimeout,
        scheduleToStartTimeout: param.pipe.scheduleToStartTimeout
      });
      param.list.workflowExecution = {
        workflowId: param.pipe.name + ' Workflow',
        runId: 'SomeRunId'
      };
      expect(JSON.stringify(asyncPipe.getNextActions(new EventList(param.list))))
        .toEqual(JSON.stringify(param.expect));
    });
  });
});
