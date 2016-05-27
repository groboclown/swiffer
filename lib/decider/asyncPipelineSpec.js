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
            failed: 'Initiate task__failed'
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
      new actions.RecordMarkerAction('Schedule the activity timed out', { state: 'TimedOut', details: 'SCHEDULE_TIMEOUT' }),
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
      new actions.RecordMarkerAction('Schedule the activity timed out, then a signal that the activity started', { state: 'TimedOut', details: 'SCHEDULE_TIMEOUT' }),
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
      workflowExecutionSignaled: {
        input: null,
        signalName: 'The activity sent the started signal__started'
      }
    }],
    expect: [
      new actions.CancelTimerAction({ attributes: { timerId: 'The activity sent the started signal__scheduleToStartTimeout' } })
    ]
  }
];

describe('Task', function () {
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
