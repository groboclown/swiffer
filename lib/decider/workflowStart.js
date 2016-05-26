var _ = require('underscore');

/**
 * A task-like object that runs a function to determine the list of actions
 * to perform at the start of the workflow.  This only has use when it's the
 * first action in the workflow.
 *
 * @param {Function} func - The function to invoke when the workflow starts.
 *        When called, the function will be passed the `WorkflowExecutionStarted`
 *        event as the argument.  It should return a list of actions or tasks
 *        to perform next.
 */
var WorkflowStart = function (func) {
  this._func = func;
};

WorkflowStart.prototype.getNextActions = function (eventlist, afterEventId) {
  var evt = _.findWhere(eventlist, {
    type: 'WorkflowExecutionStarted'
  });

  var isFirst = eventlist.length === 1;

  var actions = [];
  var tasks = [];
  if (evt) {
    var allTypes = this._func(evt) || [];
    if (!Array.isArray(allTypes)) {
      allTypes = [allTypes];
    }
    actions = allTypes.filter(function (obj) {
      return !obj.getNextActions;
    });
    tasks = allTypes.filter(function (obj) {
      return obj.getNextActions;
    });
  }
  if (isFirst && actions.length > 0) {
    return actions;
  }
  // Either it's not the first event, which means we need tasks to
  // be processed, or it's the first event and we have no raw actions,
  // so the tasks should be used.
  return tasks;
};


module.exports = WorkflowStart;