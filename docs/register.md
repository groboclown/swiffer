# Registering Domains, Workflow Types, and Activity Types

The `swiffer-decider` framework does not handle registering the requisite
objects with AWS.  You'll need to do this on your own.

Commonly, the process that starts the [decider](decider.md) will also handle
creating the domain and the workflow.  Likewise, the activity tasks should be
registered by the processes that listen for those activity tasks.  However,
you're free to put this logic wherever you find it most convenient.  For
example, a decision process may register all the activities, domain, and
workflow tasks that it references, so that it doesn't chance having an activity
scheduled that isn't known yet.

(show examples of setting up the domain, workflow types, and activity types).

Lambda functions, on the other hand, usually have a release schedule that is
independent of deploying the workflow.
