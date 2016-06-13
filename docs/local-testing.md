# Testing Locally with Pipit

When you develop your workflow, you can test it locally without incurring any
AWS charges by pointing the SWF endpoint to an instance of
[Pipit server](https://github.com/groboclown/pipit).

The easiest way to connect to a Pipit server is by changing the AWS connection
code to point to the Pipit server.

```javascript
var swfClient = new AWS.SWF({
  region: 'my-awsregion-1',
  accessKeyId: 'My Access Key',
  secretAccessKey: 'My secret access key',
  endpoint: 'http://localhost:3000/swf/'
});
```

If the Pipit server is configured to run with SSL on a locally signed
certificate, you need to load the certificate and register it with the
aws-sdk.

```javascript
var https = new require('https');
AWS.NodeHttpClient.sslAgent = new https.Agent({
  rejectUnauthorized: true,
  ca: require('fs').readFileSync('/my/path/to/cert.ca'),
});
```

Each time you start the Pipit server, you will need to re-register the
domain, activity types, workflow types, lambda functions, ECS task types, and
so on.
