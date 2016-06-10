# Deciders

A decider listens for requests from Amazon for workflow events, and funnel the
requests through the [ordered workflow tasks](pipeline.md).

The deciders require you to create a configured AWS SWF client with the 
aws-sdk.  You also need to create your workflow pipeline.  Once you have these
created, you can start a decider:

```javascript
const swf = require('swiffer-decider');
const AWS = require('aws-sdk');
var swfClient = new AWS.SWF({ /* config values */ });
var workflowPipeline = swf.createSerialPipeline([ /* tasks */ ]);

var decider = swf.createDecider(workflowPipeline, swfClient, {
  domain: 'My Domain',
  identity: 'Unique Decider ID',
  taskList: {
    name: 'workflow event channel name',
  },
});
```

When the decider is ready to begin processing events, you can start it:

```javascript
decider.start();
```

## Decider Setup

(how to setup a decider, and what all the arguments mean)

## Decider Events

### On Poll Response

When the AWS request returns with the decision (or lack of a decision), the
decision object is sent to the `poll` event listeners:

```
decider.on('poll', function (config) {
  var identity = config.identity,
  var taskListName = config.taskList.name;
});
```

### On Decision Event Processing

When a decider begins processing a decision event, the `decider` event is
fired, with the decision event as the event object.

```javascript
decider.on('decider', function (evt) {
  console.log(`Processing decision event ${JSON.stringify(evt)}`);
});
```

See the (_swf api docs_) for the contents of the event object.

### On Internal Errors

If the decider generates an internal error, the `error` event is fired, with
the exception as the event object.

```javascript
decider.on('error', function (evt) {
  console.error(`${evt.message}\n${evt.stack}`);
});
```

### On Computing Decision Actions

When the actions to run based on a workflow event are computed, the list of
actions are sent to the `actions` event listeners.

```javascript
decider.on('actions', function (actions) {
  console.log(`Sending list of actions: ${JSON.stringify(actions)}`);
});
```

### On Decision Response

When the list of decisions is ready to be sent to SWF, the list is sent to the
`decisions` event listeners.

```javascript
decider.on('decisions', function (decision) {
  console.log(`Sending list of decision: ${JSON.stringify(decision)}`);
});
```


### On Workflow Failures

If a workflow encounters an issue that causes it to be failed, a failure
event is sent to the `failure` event listeners.

```javascript
decider.on('failure', function (err) {
  console.log(`Workflow failed: ${evt.message}`);
});
```


## Details on SWF and Deciders

Under the covers, deciders perform a "long poll" HTTP request to the Amazon
servers.  The request can wait up to 60 seconds, before the request returns with
either no event data, or a decision event.

The request to listen for events passes a specific _task list_ name.  When a
workflow starts, it is assigned to a task list, either by the registered
workflow type, or by the workflow start request.  The deciders listening to that
task list name will receive the decision event.

Currently, the decider API allows for only one workflow to run on a single
task list.  If you need to support multiple workflows, each one needs to
listen on its own decider, with its own dedicated task list.

Additionally, the registered workflow types, activity types, and task lists
are segregated from each other with a _domain_.  Workflows running on one domain
do not send events to other domains.
