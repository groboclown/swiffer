var _ = require('underscore');

const pipeline = require('./pipeline');

/**
 * Used to programatically construct tasks for the next section of execution.
 * Generated tasks will be wrapped in a series pipeline.
 *
 * @param {Function} func - The function to invoke when the workflow starts.
 *        When called, the function will be passed the `WorkflowExecutionStarted`
 *        event as the argument.  It should return a list of actions or tasks
 *        to perform next.
 */
var TaskGenerator = function (func) {
  this._func = func;
};

TaskGenerator.prototype.getNextActions = function (eventlist, afterEventId) {
  var tasks = this._func(eventlist);
  if (!_.isArray(tasks)) {
    tasks = [tasks];
  }
  return (new pipeline.Series(tasks)).getNextActions(eventlist, afterEventId);
};


module.exports = TaskGenerator;
