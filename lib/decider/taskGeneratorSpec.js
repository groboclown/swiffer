var EventList = require('./eventList');
var pipeline = require('./pipeline');
var actions = require('./actions');
var Task = require('./task');
var TaskGenerator = require('./taskGenerator');

describe('TaskGenerator', function () {
  describe('simple setup', function () {
    var TaskGeneratorEventDef = {
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
    
    it('First event, no actions or tasks', function () {
        var values = new TaskGenerator(function (evt) { return []; })
        .getNextActions(new EventList([TaskGeneratorEventDef]));
        expect(values).toEqual([]);
    });
    
    it('First event, only tasks', function () {
        var values = new TaskGenerator(function (evt) {
        return [new Task({
            name: 'start timer',
            type: 'timer',
            delay: 3
        })];
        }).getNextActions(new EventList([TaskGeneratorEventDef]));
        expect(values).toEqual([new actions.TimerAction('start timer', 3)]);
    });
    
    var timerEventDef = {
        "eventType": "TimerStarted",
        "timerStartedEventAttributes": {
        "control": "first timer"
        }
    };
    
    it('Second event, no actions or tasks', function () {
        var values = new TaskGenerator(function (evt) { return [] })
        .getNextActions(new EventList([TaskGeneratorEventDef, timerEventDef]));
        expect(values).toEqual([]);
    });
    
    it('Second event, only tasks', function () {
        var values = new TaskGenerator(function (evt) {
        return [new Task({
            name: 'start timer',
            type: 'timer',
            delay: 3
        })];
        }).getNextActions(new EventList([TaskGeneratorEventDef, timerEventDef]));
        expect(values).toEqual([new actions.TimerAction('start timer', 3)]);
    });
  });
    
    
  describe('event propigation', function () {
    var pipe = new pipeline.Series([
      new TaskGenerator(function (evt) {
      // Return both an action (runs only on initial workflow start)
      // and a task (always returned).
      return [
          new Task({
          name: 'second timer',
          type: 'timer',
          delay: 15
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
        "eventTimestamp": "2015-07-14T02:39:19.767Z",
        "eventType": "TimerStarted",
        "timerStartedEventAttributes": {
          "control": "second timer"
        }
      }, {
        "eventId": 3,
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
    
    
  it('as second task', function () {
    var pipe = new pipeline.Series([
      new Task({
        name: 'first timer',
        type: 'timer',
        delay: 10
        }),
      new TaskGenerator(function (evt) {
        // Return both an action (runs only on initial workflow start)
        // and a task (always returned).
        return [
          new Task({
            name: 'second timer',
            type: 'timer',
            delay: 15
            })
        ];
      }),
    ]);
    var eventlist = new EventList([{
      eventType: 'TimerFired',
      timerFiredEventAttributes: {
        control: 'first timer'
      }
    }]);
    
    var values = pipe.getNextActions(eventlist);
    expect(values).toEqual([new actions.TimerAction('second timer', 15)]);
  });
});