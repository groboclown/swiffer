# How `swiffer-framework` Manages the Decider Logic

Deciders should be written distinctly stateless - the discovery of the next
action to take should be contained within the decider's logic and the
history of the workflow.  This implies that all logic within a workflow only
has meaning if the workflow receives an activity, or receives no activity.

`swiffer-framework` manages this process by limiting the scope of what can be
happening at once within a workflow.  All tasks trigger a start if they run
next and haven't run before, then wait until the task completion event
occurs within the event history, at which point the task tells the logic that
the next task can run.

All of this logic depends upon the decier logic to react to events from the
event history, as it should.  However, this puts limitations on what logic
the user can control.

For example, you can't add logic that generates activities in the middle of
a task, such as right after a task is scheduled, because it injects activities
that can confuse the owning pipeline.  Instead, this kind of behavior
must run from within a pipeline.