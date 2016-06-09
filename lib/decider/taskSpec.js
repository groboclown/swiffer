var EventList = require('./eventList');
var actions = require('./actions');
var retryStrategies = require('./retryStrategies');
var Task = require('./task');
var parameters = [
  // Already finished - nothing to do
  {
    task: {
      name: 'createOffer',
      type: 'activity'
    },
    list: [{
      "eventType": "ActivityTaskStarted",
      "activityTaskStartedEventAttributes": {
        "activityId": "createOffer",
      }
    }, {
      "eventType": "ActivityTaskCompleted",
      "activityTaskCompletedEventAttributes": {
        "activityId": "createOffer"
      },
    }],
    expect: []
  },
  // Not yet started. Schedule it
  {
    task: {
      name: 'newTask',
      type: 'activity'
    },
    expect: [new actions.ScheduleAction('newTask', undefined, {
      version: undefined
    })]
  },
  // Not yet started. Start the timer
  {
    task: {
      name: 'newTimer',
      type: 'timer',
      delay: 10
    },
    expect: [new actions.TimerAction('newTimer', 10)]
  },
  // Started, but not yet fired.
  {
    task: {
      name: 'myTimer',
      type: 'timer',
      delay: 10
    },
    list: [{

      "eventType": "TimerStarted",
      "timerStartedEventAttributes": {
        "control": "myTimer"
      },

    }],
    // Should be a "Noop" action
    expect: [{}]
  },
  // Started + fired. Do nothing
  {
    task: {
      name: 'myOtherTimer',
      type: 'timer',
      delay: 10
    },
    list: [{
      "eventType": "TimerStarted",
      "timerStartedEventAttributes": {
        "control": "myOtherTimer"
      }
    }, {
      "eventType": "TimerFired",
      "timerFiredEventAttributes": {
        "control": "myOtherTimer"
      }
    }],
    expect: []
  },

  // Start timer and fill in dynamic config from previous result
  {
    task: {
      name: 'newTimer',
      type: 'timer',
      delay: '$previousActivity.someResult'
    },
    list: [{
      "eventType": "ActivityTaskCompleted",
      "activityTaskCompletedEventAttributes": {
        "activityId": "previousActivity",
        "result": JSON.stringify({
          "someResult": 30
        })
      }
    }],
    expect: [new actions.TimerAction('newTimer', 30)]
  },
  
  // Timer started and canceled; do nothing
  {
    task: {
      name: 'timer started and canceled',
      type: 'timer',
      delay: 10
    },
    list: [{
      "eventType": "TimerStarted",
      "timerStartedEventAttributes": {
        "control": "timer started and canceled"
      }
    }, {
      "eventType": "TimerCanceled",
      "timerCanceledEventAttributes": {
        "control": "timer started and canceled"
      }
    }],
    expect: []
  },

  // Scheduling failed. Fatal
  {
    task: {
      name: 'badConfigActivity',
      type: 'activity'
    },
    list: [{
      "eventType": "ScheduleActivityTaskFailed",
      "scheduleActivityTaskFailedEventAttributes": {
        "activityId": "badConfigActivity",
        "cause": "SOMETHING WENT WRONG"
      }
    }],
    expect: [new actions.FatalErrorAction("SOMETHING WENT WRONG", undefined)]
  },
  // Activity failed. Retry strategy says try again right away.
  {
    task: {
      name: 'failedActivity',
      type: 'activity',
      retryStrategy: new retryStrategies.Immediate(10)
    },
    list: [{
      "eventType": "ActivityTaskFailed",
      "activityTaskFailedEventAttributes": {
        "activityId": "failedActivity"
      }
    }],
    expect: [new actions.ScheduleAction('failedActivity', undefined, {
      version: undefined
    })]
  },

  // Activity failed. Retry strategy says try again in 10 seconds
  {
    task: {
      name: 'failedActivity',
      type: 'activity',
      retryStrategy: new retryStrategies.ConstantBackoff(10, 10)
    },
    list: [{
      "eventType": "ActivityTaskFailed",
      "activityTaskFailedEventAttributes": {
        "activityId": "failedActivity"
      }
    }],
    expect: [new actions.TimerAction('failedActivity__backoff', 10)]
  },

  // Activity failed and backoff timer fired. Reschedule.
  // (These need timestamps to determine if the timer fired was after the failed)
  {
    task: {
      name: 'failedActivity',
      type: 'activity',
      retryStrategy: new retryStrategies.ConstantBackoff(10, 10)
    },
    list: [{
      "eventType": "ActivityTaskFailed",
      "eventTimestamp": "2015-07-14T02:38:17.767Z",
      "activityTaskFailedEventAttributes": {
        "activityId": "failedActivity"
      }
    }, {
      "eventType": "TimerFired",
      "eventTimestamp": "2015-07-14T02:39:17.767Z",
      "timerFiredEventAttributes": {
        "control": "failedActivity__backoff"
      }
    }],
    expect: [new actions.ScheduleAction('failedActivity', undefined, {
      version: undefined
    })]
  },
  // Activity failed twice and last backoff timer fired. Retry limit is 2, so fatal.
  {
    task: {
      name: 'failedActivity',
      type: 'activity',
      retryStrategy: new retryStrategies.ConstantBackoff(10, 2)
    },
    list: [{
      "eventType": "ActivityTaskFailed",
      "eventTimestamp": "2015-07-14T02:37:17.767Z",
      "activityTaskFailedEventAttributes": {
        "activityId": "failedActivity"
      }
    }, {
      "eventType": "ActivityTaskFailed",
      "eventTimestamp": "2015-07-14T02:38:17.767Z",
      "activityTaskFailedEventAttributes": {
        "activityId": "failedActivity"
      }
    }, {
      "eventType": "TimerFired",
      "eventTimestamp": "2015-07-14T02:39:17.767Z",
      "timerFiredEventAttributes": {
        "control": "failedActivity__backoff"
      }
    }],
    expect: [new actions.FatalErrorAction('Retry limit reached.')]

  },

  // Lambda ready to start
  {
    task: {
      name: 'lambdaReadyToStart',
      type: 'lambda',
      functionName: 'MyLambda',
      input: {
        foo: 'bar'
      }
    },
    list: [],
    expect: [new actions.ScheduleLambdaAction('lambdaReadyToStart', 'MyLambda', {"foo":"bar"}, {})]
  },

  // Lambda completed
  {
    task: {
      name: 'lambdaCompleted',
      type: 'lambda',
      functionName: 'MyLambda',
      input: {
        foo: 'bar'
      }
    },
    list: [{
      eventType: 'LambdaFunctionCompleted',
      lambdaFunctionCompletedEventAttributes: {
        result: 'Completed',
        id: 'lambdaCompleted'
      }
    }],
    expect: []
  },

  // Lambda scheduled
  {
    task: {
      name: 'lambdaScheduled',
      type: 'lambda',
      functionName: 'MyLambda'
    },
    list: [{
      eventType: 'LambdaFunctionScheduled',
      lambdaFunctionScheduledEventAttributes: {
        id: 'lambdaScheduled',
        name: 'MyLambda'
      }
    }],
    expect: [new actions.Noop()]
  },

  // Lambda failed, no retry
  {
    task: {
      name: 'lambdaFailedNoRetry',
      type: 'lambda',
      functionName: 'MyLambda',
      input: {
        foo: 'bar'
      }
    },
    list: [{
      eventType: 'LambdaFunctionFailed',
      lambdaFunctionFailedEventAttributes: {
        reason: 'event',
        id: 'lambdaFailedNoRetry'
      }
    }],
    expect: [new actions.FatalErrorAction('Retry limit reached.')]
  },

  // Lambda schedule failed
  {
    task: {
      name: 'lambdaScheduleFailed',
      type: 'lambda',
      functionName: 'MyLambda',
      input: {
        foo: 'bar'
      }
    },
    list: [{
      eventType: 'ScheduleLambdaFunctionFailed',
      scheduleLambdaFunctionFailedEventAttributes: {
        cause: 'OPEN_LAMBDA_FUNCTIONS_LIMIT_EXCEEDED',
        id: 'lambdaScheduleFailed'
      }
    }],
    expect: [new actions.FatalErrorAction("OPEN_LAMBDA_FUNCTIONS_LIMIT_EXCEEDED", undefined)]
  },

  // Input from previous task as object
  {
    task: {
      name: 'randomActivity',
      type: 'activity',
      activityVersion: '0.1',
      input: {
        baz: '$FirstActivity.foo.bar.baz'
      },
      retryStrategy: new retryStrategies.ConstantBackoff(10, 2)
    },
    list: [{
      "eventType": "ActivityTaskCompleted",
      "eventTimestamp": "2015-07-14T02:37:17.767Z",
      "activityTaskCompletedEventAttributes": {
        "activityId": "FirstActivity",
        "result": JSON.stringify({
          foo: {
            bar: {
              baz: 'boop'
            }
          }
        })
      }
    }],
    expect: [new actions.ScheduleAction('randomActivity', {
      baz: 'boop'
    }, {
      version: '0.1'
    })]
  },

  // Input from previous task as string
  {
    task: {
      name: 'randomActivity',
      type: 'activity',
      activityVersion: '0.1',
      input: {
        baz: '$FirstActivity'
      },
      retryStrategy: new retryStrategies.ConstantBackoff(10, 2)
    },
    list: [{
      "eventType": "ActivityTaskCompleted",
      "eventTimestamp": "2015-07-14T02:37:17.767Z",
      "activityTaskCompletedEventAttributes": {
        "activityId": "FirstActivity",
        "result": "boop"
      }
    }],
    expect: [new actions.ScheduleAction('randomActivity', {
      baz: 'boop'
    }, {
      version: '0.1'
    })]
  },

  // Input from workflow start activity
  {
    task: {
      name: 'randomActivity',
      type: 'activity',
      activityVersion: '0.1',
      input: {
        foo: '$$Workflow'
      },
      retryStrategy: new retryStrategies.ConstantBackoff(10, 2)
    },
    list: [{
      "eventId": 1,
      "eventTimestamp": "2015-07-19T16:34:46.246Z",
      "eventType": "WorkflowExecutionStarted",
      "workflowExecutionStartedEventAttributes": {
        "childPolicy": "TERMINATE",
        "executionStartToCloseTimeout": "1800",
        "input": "INPUT DATA",
        "parentInitiatedEventId": 0,
        "taskList": {
          "name": "RoundRobin"
        },
        "taskStartToCloseTimeout": "1800",
        "workflowType": {
          "name": "Test Workflow",
          "version": "0.1"
        }
      }
    }],
    expect: [new actions.ScheduleAction('randomActivity', {
      foo: 'INPUT DATA'
    }, {
      version: '0.1'
    })]
  },

  // Task that triggers other tasks dynamically on a timer complete.
  {
    task: {
      name: 'dynamicTimer',
      type: 'timer',
      delay: '10'
    },
    on: {
      'Completed': function (lastEvent, events, eventlist) {
        return new actions.TimerAction('newTimer', 15);
      }
    },
    list: [{
      eventType: "TimerFired",
      timerFiredEventAttributes: {
        control: "dynamicTimer",
      }
    }],
    expect: [new actions.TimerAction('newTimer', 15)]
  },
  
  // Task that has multiple lifecycle events.
  {
    task: {
      type: 'activity',
      name: 'activity1',
      activityType: 'Cool Activity',
      activityVersion:'0.1'
    },
    on: {
      'Canceled': function () {
        return [new Task({
          type: 'timer',
          name: 'scheduled timer',
          delay: 10
        })];
      },
      'Completed': function () {
        return [];
      },
    },
    list: [{
      eventType: 'ActivityTaskCanceled',
      activityTaskCanceledEventAttributes: {
        activityId: 'activity1'
      }
    }],
    expect: [new Task({
      type: 'timer',
      name: 'scheduled timer',
      delay: 10
    })]
  },
  
  // Fail the workflow with no previous task or event.
  {
    task: {
      type: 'fail',
      reason: 'hard failure',
      details: 'hard details'
    },
    list: [],
    expect: [new actions.FatalErrorAction('hard failure', 'hard details')]
  },
  
  // Fail the workflow with any event
  {
    task: {
      type: 'fail',
      reason: 'hard failure',
      details: 'hard details'
    },
    list: [{
      eventType: 'ActivityTaskCanceled',
      activityTaskCanceledEventAttributes: {
        activityId: 'activity1'
      }
    }],
    expect: [new actions.FatalErrorAction('hard failure', 'hard details')]
  },
  
  // Cancel an active timer
  {
    task: {
      type: 'cancelTimer',
      name: 'Active Timer'
    },
    list: [{
      eventType: 'TimerStarted',
      timerStartedEventAttributes: {
        control: 'Active Timer',
        startToFireTimeout: '10',
        timerId: 'abc'
      }
    }],
    expect: [new actions.CancelTimerAction({ attributes: { timerId: 'abc' } })]
  },
  
  // Timer that's already fired w/ a cancel timer task
  {
    task: {
      type: 'cancelTimer',
      name: 'Completed Timer'
    },
    list: [{
      eventType: 'TimerStarted',
      eventId: 10,
      timerStartedEventAttributes: {
        control: 'Completed Timer',
        startToFireTimeout: '10',
        timerId: 'abc'
      }
    }, {
      // Inject a timer canceled event for a different timer,
      // to ensure the event matching is right.
      eventType: 'TimerCanceled',
      eventId: 11,
      timerCanceledEventAttributes: {
        startedEventId: 9,
        timerId: 'def'
      }
    }, {
      eventType: 'TimerFired',
      eventId: 12,
      timerFiredEventAttributes: {
        startedEventId: 10,
        timerId: 'abc'
      }
    }],
    expect: []
  },
  
  // Timer that's already canceled w/ a cancel timer task
  {
    task: {
      type: 'cancelTimer',
      name: 'Canceled Timer'
    },
    list: [{
      eventType: 'TimerStarted',
      eventId: 10,
      timerStartedEventAttributes: {
        control: 'Canceled Timer',
        startToFireTimeout: '10',
        timerId: 'abc'
      }
    }, {
      eventType: 'TimerCanceled',
      eventId: 11,
      timerCanceledEventAttributes: {
        startedEventId: 10,
        timerId: 'abc'
      }
    }],
    expect: []
  },
  
  // Timer that has a cancel timer failed w/ a cancel timer task
  {
    task: {
      type: 'cancelTimer',
      name: 'Failed To Cancel Timer'
    },
    list: [{
      eventType: 'TimerStarted',
      eventId: 10,
      timerStartedEventAttributes: {
        control: 'Failed To Cancel Timer',
        startToFireTimeout: '10',
        timerId: 'abc'
      }
    }, {
      eventType: 'TimerCanceled',
      eventId: 11,
      cancelTimerFailedEventAttributes: {
        cause: 'failure',
        timerId: 'abc'
      }
    }],
    expect: [new actions.CancelTimerAction({ attributes: { timerId: 'abc' } })]
  },
  
  // Timer that failed to start w/ a cancel timer task
  //   - timer failed-to-start (StartTimerFailed) events
  //     don't map back to their start timer decision, because
  //     the control is not in the event history directly
  //     (it's stashed away in the decision event),
  //     so this case is identical (in the view of this framework)
  //     to the situation where the timer hasn't started.
  
  // Cancel a timer that hasn't started
  {
    task: {
      type: 'cancelTimer',
      name: 'Not Started Timer'
    },
    list: [],
    expect: []
  },
];

function createTask(param) {
  var task = new Task(param.task);
  if (param.on) {
    for (var k in param.on) {
      if (param.on.hasOwnProperty(k)) {
        // Back door into the event handlers for the efficiency of test
        // creation.
        task._eventHandlers[k] = param.on[k];
      }
    }
  }
  return task;
}


describe('Task', function () {
  parameters.forEach(function (param, idx) {
    it('getNextActions - parameterized - #' + idx.toString(), function () {
      var task = createTask(param);
      expect(JSON.stringify(task.getNextActions(new EventList(param.list || [])))).toEqual(JSON.stringify(
        param.expect));
    });
  });
});
