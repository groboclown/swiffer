# Tasks

Tasks define a specific behavior that the workflow should trigger during the
course of executing a [pipeline](pipeline.md).

Each task (with noted exceptions) must provide a unique name, so that the the
decider can correctly map the associated workflow events to the task.

## Task Types

The following are the different kinds of tasks allowed by the framework.
They can be created either explicitly by running

```javascript
new swf.decider.Task({ type: 'task type name', /* other details */ });
```

or through the convenience function

```javascript
swf.createSpecificTask({ /* other details */ });
```

The "other details" refers to the configuration data.  In the details for each
task, these configuration details include a reference to how it maps to the
corresponding SWF decision attribute request data, denoted by
"(==> `field.name`)".

### Activity

Activity tasks trigger the corresponding worker. They are made up of a `name`,
`version`, and an optional **Retry Strategy**.

* **Task Type**: `activity`
* **Convenience Function**: `createActivityTask`
* **Configuration**:
  * `activityType` : (string) the type name for the registered activity to run.
    If not specified, then this defaults to the `name` configuration attribute.
    (==> `activityType.name`)
  * `activityVersion` : (string) the version for the registered activity to run.
    (==> `activityType.version`)
  * `name` : (string) the activity ID, and also used as the activity type if the
    attribute `activityType` is not provided.  Note that the name must be
    unique per workflow.
    (==> `activityId`) (==> `activityType.name`)
  * `input` : (string or object or [dynamic input](#dynamic-input)) the input
    data to pass into the activity.
    If an object is given, then it will be encoded as a JSON string.
    (==> `input`)
  * `timeouts.scheduleToStart` : (string) time (in seconds) allowed for the
    workflow to wait before the activity starts before the workflow considers
    the activity as timed out.
    (==> `scheduleToStartTimeout`)
  * `timeouts.scheduleToClose` : (string) time (in seconds) allowed for the
    workflow to wait before the activity finishes before the workflow considers
    the activity as timed out.
    (==> `scheduleToCloseTimeout`)
  * `timeouts.startToClose` : (string) time (in seconds) allowed for the
    workflow to wait between when the activity starts executing and when
    the activity finishes before the workflow considers the activity timed out.
    (==> `startToCloseTimeout`)
  * `timeouts.heartbeat` : (string) time (in seconds) allowed between heartbeat
    messages sent by the activity before the workflow considers the activity
    timed out.
    (==> `heartbeatTimeout`)
  * `retryStrategy` : ([Retry Strategy](#retry-strategies)) tells the
    decider how to handle error conditions with the activity task.


  
### Timer

Timer tasks tell SWF to wait a designated number of seconds before moving to the
next task.

* **Task Type**: `timer`
* **Convenience Function**: `createTimerTask`
* **Configuration**:
  * `name` : (string) the internal name of the timer.  Note that the name must
    be unique per workflow.  This is actually the "control" field of the timer;
    the actual timerId will be created for each timer.
    (==> `control`)
  * `delay` : (string or number or [dynamic input](#dynamic-input)) the number
    of seconds to wait before the timer fires.

    
    
### Lambda

Executes a lambda function as a task in the workflow.  The lambda function
must be separately registered and managed with the AWS lambda API.  Usually,
you want to publish a version of a lambda function, and create an alias to
a specific version.  Then the workflow would reference the lambda's aliased
version.

You must provide the SWF workflow with an IAM role that gives it access to
call the lambda function.

* **Task Type**: `lambda`
* **Convenience Function**: `createLambdaTask`
* **Configuration**:
  * `name` : (string) the lambda task ID.  Note that the name must be
    unique per workflow.
    (==> `id`)
  * `functionName` : (string) the name of the lambda function to invoke.
    You can specify a function name (for example, `Resize`) or you can specify
    the Amazon Resource Name (ARN) of the function (for example,
    `arn:aws:lambda:us-east-1:my-account-id:function:Resize:$Latest`). AWS
    Lambda also allows you to specify a partial ARN (for example,
    `my-account-id:Resize:Current`).
    (==> `name`)
  * `input` : (string or object or [dynamic input](#dynamic-input)) the input
    data to pass into the activity.
    If an object is given, then it will be encoded as a JSON string.
    (==> `input`)
  * `timeouts.startToClose` : (string) maximum duration, in seconds,
    that the function may take to execute.
    (==> `startToCloseTimeout`)


### Child Workflow



### Pipeline

A [pipeline](pipeline.md) can be used in place of a task, to allow for
compositing pipelines for more complex behaviors.

### Async Pipeline



### Reactive Tasks

The last few tasks inject actions into the workflow that are reactive to the
events in the workflow history.  They should only be added into the workflow
based upon specific [logic](logic.md) around conditional events.

#### Fail Workflow

#### Cancel Timer


## Dynamic Input

### From previous activity

To modify the input based on the results of the most recently completed
"My Initial Activity" activity, do the following (the "$" is used to designate
that it is a dynamic value):

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

### From workflow execution

To modify the input based on the initial input passed to the workflow, do the
same as above, but substitute `$$Workflow` for the key:

```javascript
var task = new swf.decider.Task({
  type:'activity',
  name:'My Cool Activity',
  input:{
    foo:'$$Workflow.someProperty.myFoo'
  }
});
```

This assumes that the workflow was passed input that resembled the string
`{ "someProperty": { "myFoo": "a value" } }`.



## Retry Strategies

Retry strategies are used to determine when and how to retry an activity that
has failed or timed out.

### Exponential Backoff
With an Exponential Backoff retry strategy, every failed execution of an
activity will result in an exponentially greater timer before the next
scheduled activity.

For example, the following task will be retried up to 5 times, with the backoff
times being 2, 4, 8, and 16 seconds.

```javascript
var task = swf.createActivityTask({
  name: 'My Cool Activity',
  activityVersion: '0.1',
  retryStrategy: swf.createExponentialBackoffRetryStrategy(2, 5)
});
```

### Constant Backoff

Constant backoff strategies cause the decider to wait a constant number of
seconds before retrying the activity.

For example, the following task will be retried up to 10 times before failing
the workflow, with 30 seconds between each attempted execution:

```javascript
var task = swf.createActivityTask({
  name: 'My Cool Activity',
  activityVersion: '0.1',
  retryStrategy: swf.createConstantBackoffRetryStrategy(30, 10)
});
```

### Immediate

Immediate retry strategies will retry the failed activity immediately.

The following task will be retried up to 5 times, with the retry happening
immediately after the failed event:

```javascript
var task = swf.createActivityTask({
  name: 'My Cool Activity',
  activityVersion: '0.1',
  retryStrategy: swf.createImmediateRetryStrategy(5)
});
```

### None

The "None" retry strategy will cause a fatal error after one activity execution
failure. It is used by default so you should never have to access it directly.



## Reacting to Events

_See [logic](logic.md)_

## Generating Tasks at Runtime

_See [logic](logic.md)_

## Task Failures

When a task fails, and all its retry efforts fail, and no `onFailed` handlers
start a new task, then a task is considered to be _failed_.  Failed tasks
cause the workflow to fail.
