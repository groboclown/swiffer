# Creating Conditional Tasks and Dynamic Input

Many workflows do not conform to the simple _do this then that_ flow.  Instead,
they need the ability to integrate more complicated logic into the workflow.

For example, a system that performs transformations to a collection of files in
S3 could be written where an activity processes a single file, and the workflow
needs to spread that processing for each file.  Without the ability to create
a task for each file, the author must break out of the SWF workflow into an
alternative technology, when the SWF workflow would normally work fine.

In all these examples, you must remember that the decision logic _must be
deterministic_, and the data that drives the decision logic should only
come from the workflow history itself.  If the decision logic pulls data from
an outside service, then there's a chance that the service could be down, or
otherwise returning a non-deterministic result.  If the logic changes the
behavior using information from outside the workflow history, then the
tasks have no guarantee to be processed correctly.

## Simple Dynamic Input

Some fields, such as an activity task's `input` field, or a timer's `delay`
field, contain explicit logic to replace a string value with a value from
a history event's output field.

When one of the special fields is a string, and if the string starts with
`$(some text).`, the decision workflow will search the event history for
a task named `(some text)`, and replace the string value with the field
referenced in the event's result field.

Let's say a workflow's event history contains the event (simplified for the
example):

```json
{
  "eventType": "ActivityCompleted",
  "activityCompletedEventAttributes": {
    "activityId": "My Activity",
    "result": "[ \"time\": 30 }"
}
```

Then, if you define a later task like so:

```javascript
var swf = require('swiffer-decider');
var task = swf.createTimerTask({
  name: 'My Timer',
  delay: '$My Activity.time'
});
```

then the timer will wait for `30` seconds.

## Logical Decisions

If the workflow needs to choose which task to run next based upon the
workflow events, then use the `swf.generateTask` method.

Let's say we have a workflow that resizes videos and images, but there is
an activity that processes images, which is separate from another activity
that processes videos.

Furthermore, let's say that when an application invokes the workflow, it must
pass as input the filename to process.

```javascript
var swf = require('swiffer-decider');
var task = swf.generateTask(function (eventlist) {
  // Find the input file defined in the workflow.
  var inputFile = getWorkflowInputFile(eventlist);
  if (inputFile) {
    // Invoke a 3rd party library to discover whether this is
    // a video file or an image file.
    if (isVideoFileExtension(inputFile)) {
      return swf.createActivityTask({
        name: 'resize video',
        activityVersion: '1',
        input: {
          file: inputFile
        }
      });
    }
    if (isImageFileExtension(inputFile)) {
      return swf.createActivityTask({
        name: 'resize image',
        activityVersion: '1',
        input: {
          file: inputFile
        }
      });
    }
  }
  return swf.createFailedTask({ reason: 'no input file or it is not an image or video' });
});

function getWorkflowInputFile(eventlist) {
  var workflowStartedEvents = eventlist.filter(function (evt) {
    return evt.type === 'WorkflowExecutionStarted';
  });
  if (workflowStartedEvents && workflowStartedEvents.length > 0) {
    var out = workflowStartedEvents[0].getOutput()
    if (out && out.filename) {
      return out.filename;
    }
  }
  return false;
}
```

This hides the underlying implementation from the user - they do not need
to know whether the workflow processes images or videos differently.  Later
versions of the workflow could join these together, or provide additional
data files that it resizes (say, ASCII art).

## Dynamic Number of Tasks

If the workflow must run a number of tasks, but cannot determine the number
until runtime, then the `generateTask` method can be used.

Let's say that our workflow must process a list of files, as passed into the
workflow when it was requested to run.

```javascript
var swf = require('swiffer-decider');
var task = swf.generateTask(function (eventlist) {
  // Find the input files defined in the workflow, and
  // turn those into tasks.  Those tasks are wrapped in a
  // Parallel pipeline, so they can run at the same time.
  return swf.createParallelPipeline(
    getWorkflowInputFiles(eventlist)
      .map(function (filename) {
        return swf.createActivityTask({
          name: 'process ' + filename,
          activityType: 'process file',
          activityVersion: '1',
          input: {
            filename: filename
          }
        });
      })
  );
});

function getWorkflowInputFiles(eventlist) {
  var workflowStartedEvents = eventlist.filter(function (evt) {
    return evt.type === 'WorkflowExecutionStarted';
  });
  if (workflowStartedEvents && workflowStartedEvents.length > 0) {
    var out = workflowStartedEvents[0].getOutput()
    if (out && out.files) {
      return out.files;
    }
  }
  return [];
}
```

The `generateTasks` function is an alias for `generateTask`; both allow for
returning either one task or a list of tasks.  If more than one task is
returned, it is run in a Series pipeline.


## Reacting to Events

A workflow may also need to react to a task finishing.  Tasks can fail,
complete, or cancel.  You can register logic to trigger when these events
happen by adding an `onFailed`, `onCompleted`, and `onCanceled` handler to
the task object.

The registered event handler can return a list of tasks to be run,
a single task, or `null`.  The handler will be called with the arguments
`(eventThatTriggeredTheHandler, eventListForThisTask, fullWorkflowEventList)`.

The `eventThatTriggeredTheHandler` includes a method, `parseProperty(text)`,
that returns the parsed dynamic property from the full event history.

For example, if we have a timer that, when it fires (the timer completes),
causes the workflow to fail, but, if canceled, causes an email to be fired.

```javascript
var failWorkflowTimerTask = swf.createTimerTask({
  name: 'wait for package to be delivered',
  delay: 30
})
.onCanceled(function (evt) {
  // Timer canceled
  return swf.createActivityTask({
    name: 'send email',
    activityVersion: '1',
    input: {
      subject: 'Workflow completed',
      body: evt.parseProperty('$$Workflow.name') + ' completed without problem.',
      to: 'admins@our.site'
    }
  });
})
.onCompleted(function (evt) {
  // Timer fired
  return swf.createFailWorkflowTask({ cause: 'timer fired' });
});
```

## Reacting to Signals

[Pipelines](pipeline.md#signalling-pipelines) can react to outside generated
[signals](http://docs.aws.amazon.com/amazonswf/latest/developerguide/swf-dg-adv.html#swf-dev-adv-signals)
by the `onSignal` method.

Let's say that, using the [example above](#reacting-to-events), an outside
signal is used to cancel the timer.

```javascript
var workflowPipeline = swf.createSeriesPipeline([failWorkflowTimerTask])
.onSignal('package received',
    swf.createCancelTimerTask({
      name: 'wait for package to be delivered'
    }));
```

The pipeline will run the tasks associated with the signal each time
the signal is received. So, if the workflow is sent a signal, runs the tasks
for that signal, then receives the signal again, the tasks will run again.
If 3 signals are received before the tasks for that signal start, then the
tasks will only run once.
