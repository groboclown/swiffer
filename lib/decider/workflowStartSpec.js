var EventList = require('./eventList');
var pipeline = require('./pipeline');
var actions = require('./actions');
var Task = require('./task');
var WorkflowStart = require('./workflowStart');

describe('WorkflowStart simple setup', function () {
  var workflowStartEventDef = {
    "eventId": 1,
    "eventTimestamp": "2015-07-14T02:39:17.767Z",
    "eventType": "WorkflowExecutionStarted",
    "workflowExecutionStartedEventAttributes": {
      "childPolicy": "TERMINATE",
      "executionStartToCloseTimeout": "1800",
      "input": '{ "name": "wf input" }',
      "parentInitiatedEventId": 0,
      "taskList": {
        "name": "test-tasks4"
      },
      "taskStartToCloseTimeout": "1800",
      "workflowType": {
        "name": "Test Workflow",
        "version": "0.1"
      }
    }
  };

  it('Empty list', function () {
    var values = new WorkflowStart(function (evt) { return [{}]; })
      .getNextActions(new EventList([]));
    expect(values).toEqual([]);
  });

  it('First event, no actions or tasks', function () {
    var values = new WorkflowStart(function (evt) { return []; })
      .getNextActions(new EventList([workflowStartEventDef]));
    expect(values).toEqual([]);
  });

  it('First event, only actions', function () {
    var values = new WorkflowStart(function (evt) {
      return [new actions.Noop(), new actions.TimerAction('timer', 1)];
    }).getNextActions(new EventList([workflowStartEventDef]));
    expect(values).toEqual([
      new actions.Noop(), new actions.TimerAction('timer', 1)
    ]);
  });

  it('First event, only tasks', function () {
    var values = new WorkflowStart(function (evt) {
      return [new Task({
        name: 'start timer',
        type: 'timer',
        delay: 3
      })];
    }).getNextActions(new EventList([workflowStartEventDef]));
    expect(values).toEqual([new Task({
        name: 'start timer',
        type: 'timer',
        delay: 3
      })]);
  });

  it('First event, tasks and actions', function () {
    var values = new WorkflowStart(function (evt) {
      return [
        new actions.Noop(),
        new Task({
          name: 'start timer',
          type: 'timer',
          delay: 3
        })
      ];
    }).getNextActions(new EventList([workflowStartEventDef]));
    expect(values).toEqual([new actions.Noop()]);
  });


  var timerEventDef = {
    "eventType": "TimerStarted",
    "timerStartedEventAttributes": {
      "control": "first timer"
    }
  };

  it('Second event, no actions or tasks', function () {
    var values = new WorkflowStart(function (evt) { return [] })
      .getNextActions(new EventList([workflowStartEventDef, timerEventDef]));
    expect(values).toEqual([]);
  });

  it('Second event, only actions', function () {
    var values = new WorkflowStart(function (evt) { return [{}] })
      .getNextActions(new EventList([workflowStartEventDef, timerEventDef]));
    expect(values).toEqual([]);
  });

  it('Second event, only tasks', function () {
    var values = new WorkflowStart(function (evt) {
      return [new Task({
        name: 'start timer',
        type: 'timer',
        delay: 3
      })];
    }).getNextActions(new EventList([workflowStartEventDef, timerEventDef]));
    expect(values).toEqual([new Task({
        name: 'start timer',
        type: 'timer',
        delay: 3
      })]);
  });

  it('Second event, tasks and actions', function () {
    var values = new WorkflowStart(function (evt) {
      return [
        new actions.Noop(),
        new Task({
          name: 'start timer',
          type: 'timer',
          delay: 3
        })
      ];
    }).getNextActions(new EventList([workflowStartEventDef, timerEventDef]));
    expect(values).toEqual([new Task({
        name: 'start timer',
        type: 'timer',
        delay: 3
      })]);
  });
});


describe('WorkflowStart event propigation', function () {
  var pipe = new pipeline.Series([
    new WorkflowStart(function (evt) {
      // Return both an action (runs only on initial workflow start)
      // and a task (always returned).
      return [
        new actions.TimerAction('initial timer', 15),
        new Task({
          name: 'second timer',
          type: 'timer',
          delay: 10
        })
      ];
    }),
    new Task({
      name: 'new timer',
      type: 'timer',
      delay: 10
    })
  ]);
  it('Progress to new timer', function () {
    var eventlist = new EventList([{
      "eventId": 1,
      "eventTimestamp": "2015-07-14T02:39:17.767Z",
      "eventType": "WorkflowExecutionStarted",
      "workflowExecutionStartedEventAttributes": {
        "childPolicy": "TERMINATE",
        "executionStartToCloseTimeout": "1800",
        "input": '{ "name": "wf input" }',
        "parentInitiatedEventId": 0,
        "taskList": {
          "name": "test-tasks4"
        },
        "taskStartToCloseTimeout": "1800",
        "workflowType": {
          "name": "Test Workflow",
          "version": "0.1"
        }
      }
    }, {
      "eventId": 2,
      "eventTimestamp": "2015-07-14T02:39:18.767Z",
      "eventType": "TimerStarted",
      "timerStartedEventAttributes": {
        "control": "initial timer"
      }
    }, {
      "eventId": 3,
      "eventTimestamp": "2015-07-14T02:39:19.767Z",
      "eventType": "TimerStarted",
      "timerStartedEventAttributes": {
        "control": "second timer"
      }
    }, {
      "eventId": 4,
      "eventTimestamp": "2015-07-14T02:39:20.767Z",
      "eventType": "TimerFired",
      "timerFiredEventAttributes": {
        "control": "second timer"
      }
    }]);

    var values = pipe.getNextActions(eventlist);
    expect(values).toEqual([new actions.TimerAction('new timer', 10)]);
  });
});
