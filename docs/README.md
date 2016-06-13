# Creating Workflows with swiffer-decider

With `swiffer-decider`, you define workflows as a collection of
[tasks](task.md) that define what the workflow needs to do, along with
[pipelines](pipeline.md) that define the order in which the workflow does them.

You also can construct the workflow [execution order at runtime](logic.md)
based on previous events in the workflow.


## Documentation Index

* [Task Usage and API](task.md)
* [Pipeline Usage and API](pipeline.md)
* [Decider Usage and API](decider.md)
* [Adding Logic to the Workflow](logic.md)
* [Design of the Framework](swiffer-design.md)
* [Registering Domains, Workflow Types, and Activity Types](register.md)

## Actual Amazon Docs

You may find the actual Amazon documentation as a helpful tool in understanding
`swiffer-decider`.  The `swiffer-decider` documentation sometimes relies upon
information intrinsic to the nature of SWF, without going into detail about it.

The [developer's guide](http://docs.aws.amazon.com/amazonswf/latest/developerguide/swf-dg-basic.html)
introduces the basic concepts behind SWF.

The [api reference](http://docs.aws.amazon.com/amazonswf/latest/apireference/Welcome.html)
can help with translating the `swiffer-decider` input values into their
corresponding meaning in the actual SWF API.
