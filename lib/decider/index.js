
const Decider = require('./decider');
const RetryStrategies = require('./retryStrategies');
const Task = require('./task');
const Pipelines = require('./pipeline');
const TaskGenerator = require('./taskGenerator');
const AsyncPipeline = require('./asyncPipeline');
const actions = require('./actions');

module.exports = {
  Decider: Decider,
  RetryStrategies: RetryStrategies,
  Pipelines: Pipelines,
  Task: Task,
  TaskGenerator: TaskGenerator,
  AsyncPipeline: AsyncPipeline,
  
  createTask: function (config) {
    return new Task(config);
  },
  
  generateTask: function (func) {
    return new TaskGenerator(func);
  },
  
  createDecider: function (pipeline, client, config) {
    return new Decider(pipeline, client, config);
  },
  
  createAsyncPipeline: function (config) {
    return new AsyncPipeline(config);
  },
  
  createSeriesPipeline: function (tasks) {
    return new Pipeline.Series(tasks);
  },
  
  createParallelPipeline: function (tasks) {
    return new Pipeline.Parallel(tasks);
  },
  
  createContinuousPipeline: function (tasks) {
    return new Pipeline.Continuous(tasks);
  },
  
  createExponentialBackoffRetryStrategy: function (startAt, retryLimit) {
    return new RetryStrategies.ExponentialBackoff(startAt, retryLimit);
  },
  
  createConstantBackoffRetryStrategy: function (backoff, retryLimit) {
    return new RetryStrategies.ConstantBackoff(backoff, retryLimit);
  },
  
  createImmediateRetryStrategy: function (retryLimit) {
    return new RetryStrategies.Immediate(retryLimit);
  },
  
  // no None retry creator.
  
  createActivityTask = function (config) {
    config.type = 'activity';
    return new Task(config);
  },
  
  createTimerTask = function (config) {
    config.type = 'timer';
    return new Task(config);
  },
  
  createChildWorkflowTask = function (config) {
    config.type = 'childWorkflow';
    return new Task(config);
  },
  
  createLambdaTask = function (config) {
    config.type = 'lambda';
    return new Task(config);
  },
  
  createFailWorkflowTask = function (config) {
    config.type = 'fail';
    return new Task(config);
  },
  
  createCancelTimerTask = function (config) {
    config.type = 'cancelTimer';
    return new Task(config);
  }
};
