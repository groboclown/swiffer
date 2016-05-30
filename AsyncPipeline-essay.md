# AWS Simple Workflow without Activity Listeners

The [AWS Simple Workflow](http://docs.aws.amazon.com/amazonswf/latest/developerguide/swf-dg-intro-to-swf.html)
(SWF) supports a simple paradigm for separating:

- A workflow that has a corresponding _decider_ that chooses what will run
  next.
- Activities, which perform actual behavior.
- External signals to the workflow.

Activities and workflows are created and run independent of each other.
Deciders can request that a specific activity be run.

## Activity Safety

A nice thing about SWF is the safety it provides through timeouts in the
workflow and the activities.

Workflows:
- have a maximum time they can run.

Activities:

- have a maximum amount of time between when they are scheduled by the decider,
  to when they start running;
- have a maximum amount of time between when they start running to when they
  finish running;
- have a "heartbeat", which means they need to keep telling the workflow
  that they're still alive, within a certain time frame, or else it is
  considered dead.  As a correlary, a heartbeat sent to SWF will fail if the
  activity has been marked as timed out, so the activity knows to stop
  running.

All of these timeouts help prevent against the dreaded partial failures that
are inherent in clustered computing.  Networks can go down, packets can get
lost, and servers can get starved for CPU time.

## Downside To SWF

Both deciders and activities are written as servers that make AWS requests,
asking for what it should do next.  These _long polling_ HTTP requests
(so called because they make a request and wait up to a minute before
receiving a response) mean that you need to have a dedicated program always
running to allow it to run.

The decider can also run an
[AWS Lambda](http://docs.aws.amazon.com/amazonswf/latest/developerguide/lambda-task.html)
as an activity, but note that Lambdas
have a set of limitations (time to run, platform, implementing language, etc)
that activities do not have.

There's an
[Amazon message thread](https://forums.aws.amazon.com/message.jspa?messageID=666912)
that hints that the Amazon team is looking into making deciders be implemented
as lambdas.  For the moment, though, deciders must be written as an always
running server.

This all means that you need to have dedicated computing to run deciders and
activity processors (read: always running, so always costing you money).

For deciders, this isn't too much of an issue.  Because deciders should be
written to be stateless - they should only depend upon the event history of
their workflow - their hardware requirements are minimal, which means cheap.

For activity processors, though, they need to be running on the hardware where
the activity will run.  If the activity is a heavy, number crunching
application, then you have very expensive hardware that can potentially be
sitting idle for hours or days until it's needed.  That's a lot of wasted
computing resources and money.

You could write an activity that launches computing resources on the big iron,
but then you're back to writing your own workflow-like system, and using a
different set of technologies to solve the problem that SWF was designed for.

## Deciders, Lambdas, and ECS to the Rescue

Because the deciders can launch lambdas, which run on AWS resources, they allow
for the lambda to [run ECS tasks](http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_run_task.html)
or [Elastic Map Reduce](https://aws.amazon.com/elasticmapreduce/).

However, those other services aren't connected to SWF.  All the nice protections
that SWF provides for failure detection are now lost.

However, deciders allow for:

- Creating timers that fire at a certain time in the future, causing the
  deciders to run again with that new 'fire' event;
- Adding custom data into the event stream (called 'markers');
- Receiving outside events in the form of 'signals';
- Run child workflows.

With these extra parts, we can write a decider that simulates the workflow
for an activity.

- The lambda can launch the external processing;
- The external processing sends signals when it starts and stops;
- The external processing receives an error from SWF if the workflow to which
  it sends signals is no longer alive;
- The decider starts timers to time out the activity if signals are not received
  in a timely manner.

So, if this simulated activity runs as a child workflow, the external process
gets quick feedback if the workflow has timed out.  The decider can time out
the workflow if the external process doesn't start soon enough, or end soon
enough.  The decider and external activity can also construct a heartbeat
mechanism.

## Async Pipeline

The [swiffer-framework](README.md) allows a NodeJS process to run a decider
with a simple setup to define the workflow.  By being written for Node, it's
already in a language that's optimized for running as a lambda - if deciders
are ever allowed to be written as lambdas, then hopefully just a few tweaks to
the framework will allow your same code to run.

The [Async Pipeline](lib/decider/asyncPipeline.js) for the swiffer-framework
implements the simulated activity flow described above.

The decider needs a bit of input to get it running:

- The name of the pipeline.
- The lambda function handler name.
- Input to the lambda function handler, which must be a JSON object.
- Timeouts for the lambda, for how long the external processing has to
  send the `Started` signal, and how long the external processing has to
  send a `Completed` or `Failed` signal.

The lambda function handler will receive, in addition to the input
provided in the task definition, the JSON data:

```json
{
  "(original data)",
  "workflowExecution": {
    "workflowId": "()",
    "runId": "()"
  },
  "signals": {
    "started": "(signal name)",
    "completed": "(signal name)",
    "failed": "(signal name)",
    "heartbeat": "(signal name)"
  }
}
```

The lambda function handler needs to pass this information to the external
processing, so that it can generate the `SignalWorkflow` calls correctly.

The external processing needs to conform to the Async Pipeline standard for
generating signals.  The signals must be sent to the workflow defined in the
`workflowExecution` part of the lambda input data.

- When the external processing starts, it sends a signal with the
  `signals.started` name.  Any data in the signal is ignored.
- When the external processing completes without an error, it sends a signal
  with the `signals.completed` name.  The data in the signal is the
  result of the processing.
- When the external processing fails, it sends a `signals.failed` signal.  The
  data in the signal is the error message.  It should be a JSON object with
  key values of `details`, `cause`, `reason`, `message`, or `result`.

If, in any situation, the external process receives an error from AWS when
sending the signal, it should stop the processing.