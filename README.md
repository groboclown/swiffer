This is a NodeJS framework for constructing deciders for Amazon's [Simple Workflow Service](http://aws.amazon.com/documentation/swf/) (SWF). It allows you to configure your decisions through a combination of **Pipelines** and **Tasks** (see below), the end result being complete separation between your decider, your activity poller (worker), and the actual activities.

This is a modified version of the great [swiffer-framework](https://github.com/DispatchMe/swiffer) by Jason Raede of Dispatch Me.

# Table of Contents
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Preamble](#preamble)
  - [Disclaimer](#disclaimer)
  - [Installation](#installation)
  - [Support](#support)
  - [Contributions](#contributions)
- [Deciders](#deciders)
  - [Basic Usage](#basic-usage)
  - [Pipelines](#pipelines)
    - [Pipeline Types](#pipeline-types)
      - [Series Pipeline](#series-pipeline)
      - [Parallel Pipeline](#parallel-pipeline)
      - [Continuous Pipeline](#continuous-pipeline)
    - [Signaling Pipelines](#signaling-pipelines)
      - [Important Notes](#important-notes)
      - [Signaling Series Pipelines](#signaling-series-pipelines)
      - [Signaling Parallel Pipelines](#signaling-parallel-pipelines)
      - [Signaling Continuous Pipelines](#signaling-continuous-pipelines)
  - [Tasks](#tasks)
    - [Activity Tasks](#activity-tasks)
      - [Task Input](#task-input)
        - [Dynamic Task Input](#dynamic-task-input)
          - [From previous activity](#from-previous-activity)
          - [From workflow execution](#from-workflow-execution)
      - [Timeout Configuration](#timeout-configuration)
      - [Retry Strategies](#retry-strategies)
        - [Exponential Backoff](#exponential-backoff)
        - [Constant Backoff](#constant-backoff)
        - [Immediate](#immediate)
        - [None](#none)
    - [Timer Tasks](#timer-tasks)
      - [Dynamic Timer Delays](#dynamic-timer-delays)
- [Activity Workers](#activity-workers)
  - [Basic Usage](#basic-usage-1)
  - [Worker Types](#worker-types)
    - [Inline](#inline)
    - [AWS Lambda](#aws-lambda)
    - [Child Process](#child-process)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Preamble
## Disclaimer
This project is still in active development. As such, the API is subject to change. We will stick to the typical major/minor/patch versioning system, in which any breaking API changes will bump the major version.

## Installation
`npm install swiffer-framework`

## Support
Please create an issue if you believe you have found a bug or are having trouble. If you're able, please create a failing test for the bug you find so we can easily address it.

## Contributions
Contributions are welcome. Please follow the guideines in `.jshintrc` and use [JSBeautify](https://github.com/beautify-web/js-beautify) before pushing. Also, make sure your code is tested with [jasmine-node](https://github.com/mhevery/jasmine-node)

# Deciders
Deciders are configured via Pipelines and Tasks.

## Basic Usage

```javascript
var swf = require('swiffer-framework'),
  AWS = require('aws-sdk');


var swfClient = new AWS.SWF({
  region: 'us-east-1',
  accessKeyId: '{ACCESS-KEY}',
  secretAccessKey: '{SECRET-KEY}'
});

var decider = new swf.decider.Decider(PIPELINE, swfClient, {
  domain: 'SWF Domain',
  identity: 'Decider ID',
  taskList: {
    name: 'Task List'
  }
});

decider.on('poll', function() {
  console.log('Polling for decision tasks...');
});
decider.on('error', function(err) {
  console.error(err.message);
  if (err.stack) console.log(err.stack);
});

decider.start();
```

## Pipelines
A pipeline is a collection of one or more tasks or child pipelines. Once all tasks in the main pipeline passed to the Decider have completed successfully, the workflow is marked as complete.

### Pipeline Types
There are three types of pipeline:

#### Series Pipeline
This pipeline executes all of its tasks in sequential order. 

The below example does the following:

1. Schedule the `"My Cool Activity"` activity
2. Once it finishes successfully, start the `"My Timer"` timer
3. Timer fires after 10 seconds - schedule the `"Final Activity"` activity

```javascript
var swf = require('swiffer-framework');
var pipelines = swf.decider.Pipelines;
var Task = swf.decider.Task;

var myPipe = new pipelines.Series([
  new Task({
    type:'activity',
    name:'My Cool Activity',
    activityVersion:'0.1'
  }),

  new Task({
    type:'timer',
    name:'My Timer',
    delay:10
  }),

  new Task({
    type:'activity',
    name:'Final Activity',
    activityVersion:'0.3'
  })
]);
```

#### Parallel Pipeline
This executes all of its tasks at the same time. It is most useful as a child in a Series pipeline.

The below example does the following:

1. Schedule the `"My Cool Activity"` activity
2. Once it finishes successfully, start both activites in the child parallel pipeline
3. Schedules the `"Final Activity"` activity after both activities in the child parallel pipeline finish successfully

```javascript
var swf = require('swiffer-framework');
var pipelines = swf.decider.Pipelines;
var Task = swf.decider.Task;

var myPipe = new pipelines.Series([
  new Task({
    type:'activity',
    name:'My Cool Activity',
    activityVersion:'0.1'
  }),

  new pipelines.Parallel([
    new Task({
      type:'activity',
      name:'Parallel Task 1',
      activityVersion:'0.1'
    }),

    new Task({
      type:'activity',
      name:'Parallel Task 2',
      activityVersion:'0.1'
    }),
  ])

  new Task({
    type:'activity',
    name:'Final Activity',
    activityVersion:'0.3'
  })
]);
```

#### Continuous Pipeline
A Continuous pipeline is a Series pipeline that starts over if all of its tasks have completed successfully. It will keep running indefinitely unless you tell it to stop with a [Signal](http://docs.aws.amazon.com/amazonswf/latest/developerguide/swf-dg-adv.html#swf-dev-adv-signals).

The below example does the following:

1. Schedule the `"My Cool Activity"` activity
2. Once it finishes, wait 60 seconds with the `"My Timer"` timer
3. Schedule the `"My Cool Activity"` activity once again (back to #1)
4. Receives a `"StopMyActivity"` signal and breaks its loop

```javascript
var swf = require('swiffer-framework');
var pipelines = swf.decider.Pipelines;
var Task = swf.decider.Task;

var myPipe = new pipelines.Continuous([
  new Task({
    type:'activity',
    name:'My Cool Activity',
    activityVersion:'0.1'
  }),

  new Task({
    type:'timer',
    name:'My Timer',
    delay:60
  })
]).onSignal('StopMyActivity', 'break');
```

#### Asynchronous Pipeline
An asynchronous pipeline is a sophisticated pipeline that allows for simulating
a single SWF task, but without the need for an activity listener.  This works
by taking advantage of SWF features, like timers, signals, lambdas, and markers,
to allow you to run a task in AWS Spark, Hadoop, or Docker task through ECS
on demand.

The pipeline is created like so, and can be used in place of a task or other
pipeline.  Note that, for this pipeline, you don't add in tasks.

```javascript
var myAsyncPipe = new pipelines.AsyncPipeline({
  name: 'My Task-Like Pipeline',
  functionName: 'ExecutedLambdaFunction',
  input: '$$Workflow.task.input',
  lambdaStartToCloseTimeout: 300,
  startToCloseTimeout: 300,
  scheduleToStartTimeout: 300,
  retryStrategy: null
});
```

The pipeline will trigger a task to cause the given lambda function name
to run, using the `input` field as input.  Note that the input value must
be either a dynamic input value (see below) pointing to an object, `null`,
or an object.  It will be augmented to include these additional values, for
use by the lambda to pass on to the activity it launches:

```json
{
   // pre-existing values
  "async": {
    "workflowExecution": {
      "workflowId": "pipeline's workflow id",
      "runId": "pipeline's workflow's run id"
    },
    "signals": {
      "started": "signal name for the 'started' action",
      "completed": "signal name for the 'completed' action",
      "failed": "signal name for the 'failed' action",
      "heartbeat": "signal name for the 'heartbeat' action"
    }
  }
}
```

The activity that the lambda launches is responsible for sending signals
back to the workflow to indicate its status.

- It sends the "started" signal
(with the `signalName` value set to the above "started" name) to indicate that
it has begun.  If that signal is not received before the async pipeline's
`scheduleToStartTimeout` time expires (expressed in seconds), then the
pipeline will fail due to a timeout.
- It sends the "completed" or "failed" signal to indicate that it has finished.
if the signal is not received before the async pipeline's `startToCloseTimeout`
time expires (expressed in seconds after the "started" signal is received), then
the pipeline will fail due to a timeout.
- The heartbeat may be sent by the activity.  Currently, there is no monitoring
of the heartbeat signal.  However, it can be used by the activity to discover
whether the workflow is still alive or not.

Because the heartbeat signal will only report a failure back to the activity
if the workflow is finished, it is useful to run the async pipeline as its own
workflow, and call into it as a child workflow.


### Signaling Pipelines
All pipelines can react to a signal and start either a single task or a child pipeline.

For example, if you want a Series pipeline to wait an hour if it receives the `"WaitOneHour"` signal, you would do the following:

```javascript
var myPipe = new pipelines.Series([
  new Task({
    type:'activity',
    name:'Activity1',
    activityVersion:'0.1'
  }),
  new Task({
    type:'activity',
    name:'Activity2',
    activityVersion:'0.1'
  }),
  new Task({
    type:'activity',
    name:'Activity3',
    activityVersion:'0.1'
  })
]).onSignal('WaitOneHour', new Task({
  type:'timer',
  name:'OneHourTimer',
  delay:3600
}));
```

#### Important Notes
1. Different pipeline types respond to signals a bit differently. See below.
2. If a workflow has already received a signal one or more times, and receives that signal again, and the task/pipeline triggered by the previous signal has not yet completed, then the most recent signal will be **ignored**.

#### Signaling Series Pipelines
When a Series pipeline receives a signal, it will not execute any normal task in the pipe until the signal has been handled. If it receives multiple signals at the same time, those signals will be handled in parallel, but the Series pipeline will not continue its normal execution until all signals have been handled.

#### Signaling Parallel Pipelines
When a Parallel pipeline receives a signal, it will both respond to the signal AND continue its normal execution.

#### Signaling Continuous Pipelines
Continuous pipelines react the same way as Series pipelines do to signals. However, you can also set a signal on which to *break* the continuous loop. See examples for Continuous pipeline configuration above.

## Tasks
Tasks are the elements inside of a Pipeline and the next step(s) in the workflow.

Currently there are four task types supported: **Activities**, **Timers**, **Lambda Functions**, and **Markers**.

**IMPORTANT**: no two tasks in the same "main" pipeline (IE, the pipeline passed to the `Decider` instance) can have the same name. The name is how swiffer determines the decisions for each decision task.

### Activity Tasks
Activity tasks trigger the corresponding worker. They are made up of a `name`, `version`, and an optional **Retry Strategy**. See above examples for how to create an activity task.

#### Task Input
You can give either static or dynamic input (or no input) to your activity task. Simply define the `input` property in the task configuration:

```javascript
var task = new swf.decider.Task({
  type:'activity',
  name:'My Cool Activity',
  activityVersion:'0.1',
  input:{
    foo:'bar'
  }
});
```

##### Dynamic Task Input

###### From previous activity
To modify the input based on the results of the most recently completed "My Initial Activity" activity, do the following (the "$" is used to designate that it is a dynamic value):

```javascript
var task = new swf.decider.Task({
  type:'activity',
  name:'My Cool Activity',
  input:{
    foo:'$My Initial Activity.someProperty.myFoo'
  }
});
```

Assuming the result of the "My Initial Activity" activity was something like:

```json
{
  "someProperty":{
    "myFoo":"asdf1234"
  }
}
```

...then the input passed to the "My Cool Activity" activity would be:

```json
{
  "foo":"asdf1234"
}
```

###### From workflow execution
To modify the input based on the initial input passed to the workflow, do the same as above, but substitute `$$Workflow` for the key:

```javascript
var task = new swf.decider.Task({
  type:'activity',
  name:'My Cool Activity',
  input:{
    foo:'$$Workflow.someProperty.myFoo'
  }
});
```

#### Reacting to Lifecycle Events
A task may need to perform conditional logic around which task is run next.  You can register handlers for different final events: `onCompleted`, `onFailed`, and `onCanceled`.

If, for example, a task needs to run _N_ number of times, based upon the input from the workflow, then you can create a task:

```javascript
var task = new swf.decider.Task({
  type: 'activity',
  name: 'Prepare for parallel processing'
})
.onCompleted(function (event, taskEvents) {
  var iterations = event.parseProperty('$$Workflow.parallel_tasks');
  var tasks = [];
  for (var i = 0; i < iterations; i++) {
    tasks.push(new Task({
      type: 'activity',
      name: 'Dynamic activity ' + i,
      activityType: 'My Cool Activity',
      activityVersion: '1.0',
      input: {
        index: i
      }
    }));
  }
  return new swf.pipeline.Parallel(tasks);
});
```

If a task returns actions, tasks, or pipelines from its event handler, then the task that generated said items will not be considered fully complete until those child items are complete.

#### Timeout Configuration
SWF allows you to configure four different [timeouts](http://docs.aws.amazon.com/amazonswf/latest/apireference/API_ScheduleActivityTaskDecisionAttributes.html): `scheduleToStartTimeout`, `scheduleToCloseTimeout`, `startToCloseTimeout`, and `heartbeatTimeout`. You can provide these timeouts via your task configuration like so:

```javascript
var task = new swf.decider.Task({
  type:'activity',
  name:'My Cool Activity',
  timeouts:{
    scheduleToStart:30,
    scheduleToClose:300,
    startToClose:360,
    heartbeat:30
  }
});
```

They default to `60`, `360`, `300`, and `60`, respectively, if you do not set them.


#### Retry Strategies

Retry strategies are used to determine when and how to retry an activity that has failed or timed out.

##### Exponential Backoff
With an Exponential Backoff retry strategy, every failed execution of an activity will result in an exponentially greater timer before the next scheduled activity.

For example, the following task will be retried up to 5 times, with the backoff times being 2, 4, 8, and 16 seconds.

```javascript
var task = new swf.decider.Task({
  type:'activity',
  name:'My Cool Activity',
  activityVersion:'0.1',
  retryStrategy:new swf.decider.RetryStrategies.ExponentialBackoff(2, 5)
});
```

##### Constant Backoff
Constant backoff strategies cause the decider to wait a constant number of seconds before retrying the activity.

For example, the following task will be retried up to 10 times before failing the workflow, with 30 seconds between each attempted execution:

```javascript
var task = new swf.decider.Task({
  type:'activity',
  name:'My Cool Activity',
  activityVersion:'0.1',
  retryStrategy:new swf.decider.RetryStrategies.ConstantBackoff(30, 10)
});
```

##### Immediate
Immediate retry strategies will retry the failed activity immediately.

The following task will be retried up to 5 times, with the retry happening immediately after the failed event:

```javascript
var task = new swf.decider.Task({
  type:'activity',
  name:'My Cool Activity',
  activityVersion:'0.1',
  retryStrategy:new swf.decider.RetryStrategies.Immediate(5)
});
```

##### None
The "None" retry strategy will cause a fatal error after one activity execution failure. It is used by default so you should never have to access it directly.

### Timer Tasks
Timer tasks tell SWF to wait a designated number of seconds before moving to the next task. See above examples.

#### Dynamic Timer Delays
The timer delay can be determined by the result of a previous activity. For example, to set the timer based on the results of the most recently completed "My Cool Activity" activity, do the following (the "$" is used to designate that it is a dynamic value):

```javascript
var task = new swf.decider.Task({
  type:'timer',
  name:'My Timer',
  delay:'$My Cool Activity.someProperty.timerDelay'
});
```

Assuming the result of the "My Cool Activity" activity was something like:

```json
{
  "someProperty":{
    "timerDelay":45
  }
}
```

...then the delay would be 45 seconds.

### Lambda Function Tasks

Lambda function tasks trigger an AWS lambda function.  They invoke the lambda function specified by `functionName`, a distinct `name`, and an optional *Retry Strategy*.

#### Lambda Task Input

You can give either static or dynamic input (or no input) to your lambda function task.  Simply define the `input` property in the task configuration, just like you would with the activity task input:

```javascript
var task = new swf.decider.Task({
  type: 'lambda',
  name: 'Neato Lambda Function Activity',
  functionName: 'MyLambdaFunction',
  input: {
    foo: 'bar'
  }
});
```


### Marker Tasks

Marker tasks record information in the workflow, which can be used for debugging purposes or for capturing the workflow state.

#### Marker Task Details

You can give either static or dynamic details (or no details) to your marker task.  Simply define the `details` property in the task configuration, just like you would with the activity task input:

```javascript
var task = new swf.decider.Task({
  type: 'marker',
  name: 'Workflow Delay Time',
  details: '$My Cool Activity.someProperty.timerDelay'
});
```


## Child Workflow Tasks
You can trigger a child workflow from within a parent workflow. For all intents and purposes, the child workflow is the same as an activity task (see above). It will be considered "done" when the entire child workflow has finished, and uses retry strategies in the same manner that activity tasks do. Note that in case you want to trigger the same child workflow in multiple parts of your pipeline, the `name` property (which must be unique so swiffer can identify related tasks) is separate from the `workflowName` property, which is the name of the workflow in SWF.

Example:

```javascript
var task = new swf.decider.Task({
  type:'childWorkflow',
  name:'MyChildWorkflow',
  workflowName:'name of my child workflow',
  workflowVersion:'1.0'
});
```

# Activity Workers
[Activity workers](http://docs.aws.amazon.com/amazonswf/latest/developerguide/swf-dev-actors.html#swf-dev-actors-activities) are the opposite side of the equation from the Deciders. They perform the activities scheduled by their corresponding Decider.

## Basic Usage

```javascript
var swf = require('swiffer-framework'),
  AWS = require('aws-sdk');


var swfClient = new AWS.SWF({
  region: 'us-east-1',
  accessKeyId: '{ACCESS-KEY}',
  secretAccessKey: '{SECRET-KEY}'
});

var worker = new swf.worker.Worker(swfClient, {
  domain: 'Testing',
  identity: 'test-worker',
  taskList: {
    name: 'MyWorkflow'
  }
});

worker.register('Initialize', new swf.worker.Types.Inline(function() {
  this.heartbeat('Started!');

  this.done({
    id:'12345'
  });
}));

worker.on('poll', function() {
  console.log('Polling...');
});

worker.start();
```

## Worker Types

### Inline
The inline worker is simply a Javascript function that gets bound to the `Activity` object. Inline workers can call `this.heartbeat()` to register an SWF heartbeat, `this.error()` to signal an activity failure, and `this.done()` to signal that the activity completed successfully. See above for an example.

Note that `heartbeat()`, `error()`, and `done()` are wrapped in `Futures` from [laverdet/node-fibers](https://github.com/laverdet/node-fibers). This allows you to call them and wait for an acknowledgement from SWF without needing messy asynchronous code.

### AWS Lambda
This will allows you to defer the worker code to an AWS Lambda function. You must provide your own instance of `AWS.Lambda` from the [aws-sdk](https://github.com/aws/aws-sdk-js) library. For example, to call a Lambda function called "MyLambdaFunction", that responds to the "LambdaActivity" activity, you can do the following:

```javascript
var myLambdaClient = new AWS.Lambda({
  region: 'us-east-1',
  accessKeyId: '{ACCESS-KEY}',
  secretAccessKey: '{SECRET-KEY}'
});

worker.register('LambdaActivity', new swf.worker.Types.AWSLambda(myLambdaClient, 'MyLambdaFunction'));
```

### Child Process
Coming soon. Will allow you to spawn an arbitrary shell process.



