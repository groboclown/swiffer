var Decider = require('./decider');
var actions = require('./actions');

describe('Decider', function () {
  var errors = null;
  function createDecider(pipe) {
    var ret = new Decider(pipe, {
      respondDecisionTaskCompletedAsync: function (data) {
        return data.decisions;
      }
    }, {});
    ret.on('error', function (err) {
      errors = errors || [];
      errors.push(err);
    });
    ret.on('failure', function (err) {
      errors = errors || [];
      errors.push(err);
    });
    return ret;
  }
  var eventlist = [
    {
      "eventType": "WorkflowExecutionStarted",
      "workflowExecutionStartedEventAttributes": {
        "childPolicy": "TERMINATE",
        "executionStartToCloseTimeout": "1800",
        "input": "INPUT DATA",
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
    }
  ];
  describe('_handleEvents', function () {
    it('No results', function () {
      var decider = createDecider({
        getNextActions: function (evts) {
          return [];
        }
      });
      var results = decider._handleEvents('taskToken', eventlist);
      expect(results).toEqual([{
        decisionType: 'CompleteWorkflowExecution',
        completeWorkflowExecutionDecisionAttributes: {
          result: 'All tasks completed successfully.'
        }
      }]);
    });

    it('Only marker results', function () {
      var decider = createDecider({
        getNextActions: function (evts) {
          return [ new actions.RecordMarkerAction('marker', { a: 1 }) ];
        }
      });
      var results = decider._handleEvents('taskToken', eventlist);
      expect(results).toEqual([{
        decisionType: 'RecordMarker',
        recordMarkerDecisionAttributes: {
          markerName: 'marker',
          details: '{"a":1}'
        }
      }, {
        decisionType: 'CompleteWorkflowExecution',
        completeWorkflowExecutionDecisionAttributes: {
          result: 'All tasks completed successfully.'
        }
      }]);
    });

    it('Error', function () {
      var decider = createDecider({
        getNextActions: function (evts) {
          return [ new actions.FatalErrorAction('er') ];
        }
      });
      var results = decider._handleEvents('taskToken', eventlist);
      expect(results).toEqual([{
        decisionType: 'FailWorkflowExecution',
        failWorkflowExecutionDecisionAttributes: {
          reason: 'er'
        }
      }]);
      expect(errors.length).toEqual(1);
    });
  });

});
