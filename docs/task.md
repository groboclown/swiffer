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
"(==> `field.name`)".  The data type of each field is marked in parenthesis
after the field name; if the value is optional, then it is marked as optional.

### Activity

Activity tasks trigger the corresponding worker. They are made up of a `name`,
`version`, and an optional **Retry Strategy**.

* **Task Type**: `activity`
* **Convenience Function**: `createActivityTask`
* **Configuration**:
  * `activityType` : (_optional_ string) the type name for the registered
    activity to run.  If not specified, then this defaults to the `name`
    configuration attribute.
    (==> `activityType.name`)
  * `activityVersion` : (string) the version for the registered activity to run.
    (==> `activityType.version`)
  * `name` : (string) the activity ID, and also used as the activity type if the
    attribute `activityType` is not provided.  Note that the name must be
    unique per workflow.
    (==> `activityId`) (==> `activityType.name`)
  * `input` : (_optional_ string or object or [dynamic input](#dynamic-input))
    the input data to pass into the activity.
    If an object is given, then it will be encoded as a JSON string.
    (==> `input`)
  * `timeouts.scheduleToStart` : (_optional_ string) time (in seconds) allowed
    for the workflow to wait before the activity starts before the workflow considers
    the activity as timed out.
    (==> `scheduleToStartTimeout`)
  * `timeouts.scheduleToClose` : (_optional_ string) time (in seconds) allowed
    for the workflow to wait before the activity finishes before the workflow
    considers the activity as timed out.
    (==> `scheduleToCloseTimeout`)
  * `timeouts.startToClose` : (_optional_ string) time (in seconds) allowed for
    the workflow to wait between when the activity starts executing and when
    the activity finishes before the workflow considers the activity timed out.
    (==> `startToCloseTimeout`)
  * `timeouts.heartbeat` : (_optional_ string) time (in seconds) allowed
    between heartbeat messages sent by the activity before the workflow
    considers the activity timed out.
    (==> `heartbeatTimeout`)
  * `retryStrategy` : (_optional_ [Retry Strategy](#retry-strategies)) tells the
    decider how to handle error conditions with the activity task.  The default
    strategy is `None` (do not retry the activity)

##### Example    

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

Runs the registered activity type "My Cool Activity", version
"0.1".  The generated activity request will include the input text
`{"foo":"bar"}`.

##### Example

```javascript
var task = swf.createActivityTask({
  name: 'My Cool Activity 2',
  activityType: 'My Cool Activity',
  activityVersion: '0.1'
});
```

Runs the registered activity type "My Cool Activity", version "0.1".
It is also given the name "My Cool Activity 2", which allows for multiple runs
of the same activity type within the same workflow.


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
    (==> `startToFireTimeout`)


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
    You can give a function name (for example, `Resize`) or the Amazon Resource
    Name (ARN) of the function (for example,
    `arn:aws:lambda:us-west-2:my-account-id:function:Resize:`), or a
    partial ARN (for example, `my-account-id:Resize`).  You can also
    give the version number in the name (for example, `Resize:$Latest`,
    `arn:aws:lambda:us-west-2:my-account-id:function:Resize:$Latest`, or
    `my-account-id:Resize:$Latest`).
    (==> `name`)
  * `input` : (_optional_ string or object or [dynamic input](#dynamic-input))
    the input data to pass into the lambda function as the `event` argument.
    If an object is given, then it will be encoded as a JSON string.
    (==> `input`)
  * `timeouts.startToClose` : (_optional_ string) maximum duration, in seconds,
    that the function may take to execute.
    (==> `startToCloseTimeout`)
  * `retryStrategy` : (_optional_ [Retry Strategy](#retry-strategies)) tells the
    decider how to handle error conditions with the lambda function.  The
    default strategy is `None` (do not retry the lambda)


### Child Workflow

Starts another workflow as a child task in the current workflow.  This allows
breaking down a complex workflow into simpler, more manageable, and potentially
reusable components.

Additionally, because they can be interacted with by outside actions independent
of the parent workflow (through signals, cancelation requests, and termination
requests), they add an additional level of control not possible without
custom code on the decider level.  Additionally, a _child policy_ allows for
the child workflow to not necessarily terminate when the parent workflow
terminates.

Remember that each child workflow type must be registered before being run,
and requires a decider that knows how to handle it.

Many of the optional fields override the default value for the workflow type.
The value must be specified in at least the workflow type or the invocation.
If it isn't specified in either place, then the start workflow request will
fail.

* **Task Type**: `childWorkflow`
* **Convenience Function**: `createChildWorkflowTask`
* **Configuration**:
  * `name` : (string) the internal name of the workflow.  Note that the name
    must be unique per parent workflow.  This is actually the "control" field
    of the child workflow; the actual workflowId will be created for each
    child workflow.
    (==> `control`)
  * `workflowType` : (string) the registered workflow type name of the child
    workflow.
    (==> `workflowType.name`)
  * `workflowName` : (_deprecated_ string) the equivalent of
    `workflowType`.  Kept for backwards compatibility with `swiffer-framework`.
    (==> `workflowType.name`)
  * `workflowVersion` : (string) the registered workflow type version of the
    child workflow.
    (==> `workflowType.version`)
  * `input` : (_optional_ string or object or [dynamic input](#dynamic-input))
    the input data to pass into the workflow.
    If an object is given, then it will be encoded as a JSON string.
    (==> `input`)
  * `childPolicy` : (_optional_ string) how the child workflow created by this
    call (_A_) deals with its own child workflows when _A_ terminates.
    (==> `childPolicy`)
    Valid values are:
    * `TERMINATE` : the child executions will be terminated when _A_ terminates;
    * `REQUEST_CANCEL` : a WorkflowExecutionCancelRequested event is added to
      each running child workflow of _A_.  It is up to the decider of each
      child to handle the request appropriately.
    * `ABANDON` : The child executions will continue to run.
  * `lambdaRole` : (_optional_ string) The ARN of an IAM role that authorizes
    the child workflow to invoke AWS Lambda functions.
  * `tagList` : (_optional_ list of strings) up to 5 tags associated with the
    workflow, to help in managing and monitoring workflows.
  * `taskList` : (_optional_ string) the name of the task list that the child
    workflow type's decider listens on to receive event notifications from SWF.
  * `taskPriority` : (_optional_ string) an integer value from -2147483648 to
    2147483647 that indicate the relative priority for running the workflow;
    higher numbers mean a higher priority.
  * `timeouts.executionStartToClose` : (_optional_ string) maximum duration in
    seconds that the child workflow is allowed to run before it is closed as
    timed out.
  * `timeouts.taskStartToCloseTimeout` : (_optional_ string) maximum allowed
    time in seconds each decision task has to receive a decision event and
    respond with an action before the decision is marked as timed out.


### Pipeline

A [pipeline](pipeline.md) can be used in place of a task, to allow for
compositing pipelines for more complex behaviors.


### Async Pipeline

A very special kind of pipeline that acts like a task, but actually coordinates
with a lambda function to invoke a process.  This allows the workflow to run
long running tasks that do not need to have a process actively listening for
activity requests.  Running the tasks on-demand, such as through Hadoop or
an Amazon ECS task, can lead to reduced resource requirements and cost savings.

The async pipeline will trigger a task to cause the given lambda function name
to run, using the `input` field as input.  Note that the input value must
be either a dynamic input value (see below) pointing to an object, `null`,
or an object.  It will be augmented to include these additional values, for
use by the lambda to pass on to the activity it launches:

```json
{
  "async": {
    "workflowExecution": {
      "workflowId": "pipeline's workflow id",
      "runId": "pipeline's workflow's run id"
    },
    "domain": "pipeline's domain",
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

- It sends the "started" signal (with the `signalName` value set to the above
  "started" name) to indicate that it has begun.  If that signal is not
  received before the async pipeline's `scheduleToStartTimeout` time expires
  (expressed in seconds), then the pipeline will fail due to a timeout.
- It sends the "completed" or "failed" signal to indicate that it has finished.
  if the signal is not received before the async pipeline's
  `startToCloseTimeout` time expires (expressed in seconds after the "started"
  signal is received), then the pipeline will fail due to a timeout.
- The heartbeat may be sent by the activity.  Currently, there is no monitoring
  of the heartbeat signal.  However, it can be used by the activity to discover
  whether the workflow is still alive or not.

Because the heartbeat signal will only report a failure back to the activity
if the workflow is finished, it is useful to run the async pipeline as its own
workflow, and call into it as a child workflow.

* **Convenience Function**: `createAsyncPipeline`
* **Configuration**:
  * `name` : (string) name of the async pipeline.  This is used to set the
    state of the pipeline in a Marker (the `markerName` is the same as this
    name value).
  * `functionName` : (string) the name of the lambda function to invoke.
    You can give a function name (for example, `Resize`) or the Amazon Resource
    Name (ARN) of the function (for example,
    `arn:aws:lambda:us-west-2:my-account-id:function:Resize:`), or a
    partial ARN (for example, `my-account-id:Resize`).  You can also
    give the version number in the name (for example, `Resize:$Latest`,
    `arn:aws:lambda:us-west-2:my-account-id:function:Resize:$Latest`, or
    `my-account-id:Resize:$Latest`).
    (==> `name`)
  * `input` : (_optional_ object or [dynamic input](#dynamic-input))
    the initial input data to pass into the lambda function as the `event`
    argument.  Additional data will be added to the object (or, if not given,
    it will be created as an empty object), so that the lambda can have all the
    necessary information to send signals back to the pipeline.
    The value can be more fully changed by adding the `populateInput`
    field.
    The final input value will be encoded as a JSON string for
    passing into the lambda.
  * `populateInput` : (_optional_ function) called when the lambda is ready to
    be scheduled.  Takes the arguments
    `(input_object, workflow_schedule_input_object, eventlist)`.
  * `retryStrategy` : (_optional_ [Retry Strategy](#retry-strategies)) tells the
    decider how to handle error conditions with the lambda function.  The
    default strategy is `None` (do not retry the lambda).
  * `isStandaloneWorkflow` : (_optional_ boolean) is this run as a stand-alone
    workflow?  Necessary for triggering specific logic for reacting to events.
  * `timeouts.lambdaStartToClose` : (_optional_ string or number) start to close
    timeout, in seconds, for the lambda.  Defaults to `300`.
  * `timeouts.startToClose` : (_optional_ string or number) total seconds from
    when the spawned activity starts to when it is considered timed out.
    Defaults to `300`.
 * `timeouts.scheduleToStart` : (_optional_ string or number) duration in
   seconds the workflow is allowed to wait between when the lambda finishes
   running to when the signal from the activity is encountered.  If this time
   is exceeded, then the pipeline is considered timed out.  Defaults to `300`.
 * `timeouts.scheduleToClose` : (_optional_ string or number) duration in
   seconds the workflow is allowed to wait between when the lambda is first
   triggered to when the pipeline finishes.  If this time is exceeded, then the
   pipeline is considered timed out.  Defaults to `300`.
   _Note: may be supported in a future version, but currently does nothing._
 * `timeouts.heartbeat` : (_optional_ string or number) duration in seconds
   between each heartbeat message from the invoked remote task.  The heartbeats
   are expected once the `start` signal is received.  Defaults to `NEVER`.
   Heartbeats can be sent by the invoked remote task even if this is set to
   `NEVER`; doing so allows the remote task to determine whether the
   workflow is still running or not.
   _Note: may be supported in a future version, but currently does nothing._


### Reactive Tasks

The last few tasks inject actions into the workflow that are reactive to the
events in the workflow history.  They should only be added into the workflow
based upon specific [logic](logic.md) around conditional events.

#### Fail Workflow

Causes the workflow to immediately fail.

* **Task Type**: `fail`
* **Convenience Function**: `createFailWorkflowTask`
* **Configuration**:
  * `reason` : (_optional_ string or [dynamic input](#dynamic-input)) the
    reason for the failure.
    (==> `reason`)
  * `details` : (_optional_ string or [dynamic input](#dynamic-input)) the
    details behind the error.
    (==> `details`)


#### Cancel Timer

Cancels a running timer.  If the timer is not actively running, then the
cancel will not be sent.  If multiple timers were triggered (say, in a
Continuous Pipeline), then only the most recently run timer with the
given name will be canceled.

* **Task Type**: `cancelTimer`
* **Convenience Function**: `createCancelTimerTask`
* **Configuration**:
  * `name` : (string) the internal name of the timer.  Note that the name must
    be unique per workflow.  This is actually the "control" field of the timer.


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
