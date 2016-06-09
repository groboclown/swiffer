// This is the decider version of swiffer.
// It is still backwards compatible with swiffer,
// but the decider aspect is now front and center.

const decider = require('./lib/decider');

module.exports = {
  decider: decider,
  worker: require('./lib/worker'),
  
  createTask: function (config) {
    return decider.createTask(config);
  },
  
  generateTask: function (func) {
    return decider.generateTask(func);
  },
  
  generateTasks: function (func) {
    return decider.generateTask(func);
  },
  
  createDecider: function (pipeline, client, config) {
    return decider.createDecider(pipeline, client, config);
  },
  
  createAsyncPipeline: function (config) {
    return decider.createAsyncPipeline(config);
  },
  
  createSeriesPipeline: function (tasks) {
    return decider.createSeriesPipeline(tasks);
  },
  
  createParallelPipeline: function (tasks) {
    return decider.createParallelPipeline(tasks);
  },
  
  createContinuousPipeline: function (tasks) {
    return decider.createContinuousPipeline(tasks);
  },
  
  createExponentialBackoffRetryStrategy: function (startAt, retryLimit) {
    return decider.createExponentialBackoffRetryStrategy(startAt, retryLimit);
  },
  
  createConstantBackoffRetryStrategy: function (backoff, retryLimit) {
    return decider.createConstantBackoffRetryStrategy(backoff, retryLimit);
  },
  
  createImmediateRetryStrategy: function (retryLimit) {
    return decider.createImmediateRetryStrategy(retryLimit);
  },
  
  // no None retry creator.
  
  createActivityTask = function (config) {
    return decider.createActivityTask(config);
  },
  
  createTimerTask = function (config) {
    return decider.createTimerTask(config);
  },
  
  createChildWorkflowTask = function (config) {
    return decider.createChildWorkflowTask(config);
  },
  
  createLambdaTask = function (config) {
    return decider.createLambdaTask(config);
  },

  createFailWorkflowTask = function (config) {
    return decider.createFailWorkflowTask(config);
  },
  
  createCancelTimerTask = function (config) {
    return decider.createCancelTimerTask(config);
  }
};
