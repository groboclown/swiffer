# Pipelines

Pipelines take a collection of [tasks](task.md), and run them in the order
specific to the pipeline.

[Serial pipelines](#serial-pipeline) run the tasks one after the other.
[Parallel pipelines](#parallel-pipeline) run the tasks all at the same time.
[Continuous pipelines](#continuous-pipeline) run the tasks serially, but
in a loop until an outside action signals the pipeline to stop looping.

All pipelines can react to workflow [signals](#signaling-pipelines) to
allow for interrupting behavior.  They also immediately stop when a
[task failure](#task-failures) occurs.

Pipelines also allow for [composition](#composing-pipelines), for more
complex behaviors.

## Series Pipeline

Series pipelines allow for the most common behavior: _A then B_.  When the
pipeline starts, the first task will begin execution.  Once that task
completes its execution, the next task begins execution.  When all the tasks
finish executing, the series pipeline completes.

```javascript
var swf = require('swiffer-decider');
var seriesPipeline = swf.createSeriesPipeline([task1, task2, task3]);
```

Let's say you wanted to create a pipeline that downloads logs to a database,
then analyzes them for security attack detection:

```javascript
var attackDetectionPipeline = swf.createSeriesPipeline([
  swf.createActivityTask({
    name: 'Move logs to db',
    activityVersion: '1.0'
  }),
  swf.createActivityTask({
    name: 'Detect attacks',
    activityVersion: '1.0'
  })
]);
```

## Parallel Pipeline

Parallel pipelines trigger all the tasks in the pipeline to run at the same
time.  The parallel pipeline will complete execution when all of the child
tasks complete.

```javascript
var swf = require('swiffer-decider');
var parallelPipeline = swf.createParallelPipeline([taskA, taskB, taskC]);
```

Parallel pipelines are commonly found [as child tasks](#composing-pipelines)
of [serial pipelines](#serial-pipeline).

For example, a team needs to transcode a raw video file, 'myVideoFile.raw',
into ogv, mkv, and avi files.  This can all be done in parallel.  Note that,
because these are all using the `transcode` activity type, they must distinguish
themselves through the task name.

```javascript
var transcodePipeline = swf.createParallelPipeline([
  swf.createActivityTask([
    name: 'transcode ogv',
    activityType: 'transcode',
    activityVersion: 'beta',
    input: {
      format: 'ogv',
      file: 'myVideoFile.raw'
    }
  ]),
  swf.createActivityTask([
    name: 'transcode mkv',
    activityType: 'transcode',
    activityVersion: 'beta',
    input: {
      format: 'mkv',
      file: 'myVideoFile.raw'
    }
  ]),
  swf.createActivityTask([
    name: 'transcode avi',
    activityType: 'transcode',
    activityVersion: 'beta',
    input: {
      format: 'avi',
      file: 'myVideoFile.raw'
    }
  ])
]);
```

## Continuous Pipeline

A Continuous pipeline runs a [series of tasks](#series-pipeline), and repeats
the tasks if they completed successfully.  It will keep running indefinitely
until the workflow is terminated, or until it receives a
[signal](http://docs.aws.amazon.com/amazonswf/latest/developerguide/swf-dg-adv.html#swf-dev-adv-signals)
with the signal name `break`.

```javascript
var swf = require('swiffer-decider');
var continuousPipeline = swf.createContinuousPipeline([taskAleph, taskBeth]);
```

_TODO at the moment, each workflow can have only one continuous pipeline.
In the future, this should be altered to allow a continuous pipeline to be
canceled when the workflow is canceled, or when a specifically named signal
is received._

Let's say we need a workflow to analyze a website, looking for broken links.
It runs with a 30 minute break in between executions, and will stop if a broken
link is found, or if the user signals it to stop.

```javascript
var monitorWebsitePipeline = swf.createContinuousPipeline([
  swf.createActivityTask({
    name: 'find dead links',
    version: '1.0'
  }),
  swf.createTimerTask({
    name: 'pause before retrying',
    delay: 30 * 60 // Convert 30 minutes to seconds
  })
]);
```

## Signaling Pipelines

Along with signaling a [continuous pipeline](#continuous-pipeline) to break
from looping, you can also add tasks to run when a signal is sent to a workflow.
Tasks are added to the specific signal name in the pipeline's `onSignal` method.

```javascript
var myPipeline = swf.createSeriesPipeline([task1, task2])
  .onSignal('signal name 1', [taskA, taskB]);
```

Say we have a pipeline that can be interrupted mid-processing to send an email
status.

```javascript
var myLongPipeline = swf.createSeriesPipeline(longArrayOfTasks)
  .onSignal('status', swf.createActivityTask({
    name: 'email status',
    activityVersion: '1.0'
  }));
```

Note that the pipeline will run the tasks associated with the signal each time
the signal is received. So, if the workflow is sent a signal, runs the tasks
for that signal, then receives the signal again, the tasks will run again.
If 3 signals are received before the tasks for that signal start, then the
tasks will only run once.


#### Signaling Series Pipelines

When a Series pipeline receives a signal, it will not execute any normal task
in the pipe until the signal has been handled. If it receives multiple signals
at the same time, those signals will be handled in parallel, but the Series
pipeline will not continue its normal execution until all signals have been
handled.


#### Signaling Parallel Pipelines

When a Parallel pipeline receives a signal, it will both respond to the signal
AND continue its normal execution.


#### Signaling Continuous Pipelines

Continuous pipelines react the same way as Series pipelines do to signals.
However, you can also set a signal on which to *break* the continuous loop. See
examples for Continuous pipeline configuration above.



## Composing Pipelines

Anywhere you can add a task into a workflow, you can add a pipeline.  This
_composing_ of pipelines allows for flexible behavior flows.

Let's say you have a workflow that downloads the latest version of a video,
transcodes it into ogv, mkv, and avi formats, then sends out an email when
the processing completes.

The individual tasks are:

1. Download the latest video:

```javascript
var videoDownload = swf.createActivityTask({
  name: 'download video',
  activityVersion: '1'
});
```

2. Transcode the video.  For this, we'll reuse the `transcodePipeline` variable
   as described in the [parallel pipeline](#parallel-pipeline) above.

3. Send an email:

```javascript
var sendEmail = swf.createActivityTask({
  name: 'send email',
  activityVersion: '1.1',
  input: {
    subject: 'Transcode Completed',
    body: 'Video transcode completed',
    to: 'admin@my.site'
  }
});
```

The final workflow would tie those three parts under a series pipeline:

```javascript
var finalWorkflow = swf.createSeriesPipeline([
  videoDownload,
  transcodePipeline,
  sendEmail
]);
```


## Task Failures

When a task fails, and all its retry efforts fail, and no `onFailed` handlers
start a new task, then a task is considered to be _failed_.  Failed tasks
cause the workflow to fail.
