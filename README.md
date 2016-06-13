This is a NodeJS framework for constructing deciders for Amazon's
[Simple Workflow Service](http://aws.amazon.com/documentation/swf/) (SWF). It
allows you to configure your decisions through a combination of **Pipelines**
and **Tasks** (see below), the end result being complete separation between
your decider, your activity poller (worker), and the actual activities.

This is a modified version of the great
[swiffer-framework](https://github.com/DispatchMe/swiffer) by Jason Raede of
Dispatch Me.  This fork attempts to maintain as much backwards compatibility
as possible.

# Installation

`npm install -s swiffer-decider`

# Usage

Import the framework:

```javascript
const swf = require('swiffer-decider');
```

Define your workflow as an [ordered list](docs/pipeline.md) of
[tasks](docs/task.md), possibly including [logic](docs/logic.md):

```javascript
var workflowPipeline = swf.createSeriesPipeline([
  // Downloads all the files from the S3 bucket into a local store, and
  // returns as output the list of downloaded files.
  swf.createActivityTask({
    name: "Download files",
    activityVersion: "beta",
    input: {
      source: "s3://my-bucket/incoming"
    }
  }),
  // For each downloaded file, process it.
  swf.generateTask(function (eventlist) {
    var tasks = eventlist.filter(function (evt) {
      // Find the completed activity event for the "Download files" task.
      return evt.name === "Download files" && evt.isCompleted();
    })
    // Get the result from that activity and create a process task for each
    // file.
    [0].getOutput().files.map(function (filename) {
      return swf.createActivityTask({
        name: "Process " + filename,
        activityType: "Process Input File",
        activityVersion: "buttered bread",
        input: { filename: filename }
      })
      .onFailed(function (errEvent) {
        // If the activity fails, send an email...
        return swf.createSeriesPipeline([
          swf.createActivityTask({
            name: "Announce failure",
            activityType: "Send Email",
            activityVersion: "1.2-final",
            input: {
              subject: "Processing failed for " + filename,
              body: "File " + filename + " failed: " + errEvent.getRawOuput(),
              to: "admins@my.site"
            }
          }),
          // And fail the workflow
          // (Because we added an onFailed listener, the failure will not
          // trigger a workflow failure, so we explicitly add it.)
          swf.createFailWorkflowTask(errEvent.getOutput())
        ]);
      });
    });
    // Run all the file processing in parallel.
    return swf.createParallelPipeline(tasks);
  }),
  // Send an email when complete.
  swf.createActivityTask({
    name: "Announce completion",
    activityType: "Send Email",
    activityVersion: "1.2-final",
    input: {
      subject: "Processing Completed",
      body: "All Files Processed",
      to: "admins@my.site"
    }
  })
]);
```

Listen for [requests](docs/decider.md) with a configured AWS connection:

```javascript
const AWS = require('aws-sdk');
var swfClient = new AWS.SWF({
  region: region,
  accessKeyId: 'access key',
  secretAccessKey: 'secret access key'
});

swf.createDecider(workflowPipeline, swfClient, {
  domain: 'My Domain',
  identity: 'Process Incoming Files',
  taskList: {
    name: 'processIncomingFiles',
  },
})
.on('poll', function onPoll() {
  console.log(`Polling`);
})
.on('error', function onError(err) {
  console.error('Process Incoming Files Error: ' + err.message + '\n' + err.stack);
})
.start();
```

For full documentation on using the framework, please reference
[the documentation](docs/README.md).

# Support

Please create an issue if you believe you have found a bug or are having
trouble. If you're able, please create a failing test for the bug you find so
we can easily address it.

# Contributions

Contributions are welcome. Please follow the guideines in `.jshintrc` and use
[JSBeautify](https://github.com/beautify-web/js-beautify) before pushing. Also,
make sure your code is tested with [jasmine-node](https://github.com/mhevery/jasmine-node)

# License

Distributed under the MIT license

```
The MIT License (MIT)

Copyright (c) 2016 Matt Albrecht
Copyright (c) 2015 Dispatch Technologies Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
