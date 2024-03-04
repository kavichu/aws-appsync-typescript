---
title: Using CDK and Typescript to create an AppSync GraphQL API
published: false
description: This post explains how to use CDK and AWS AppSync to create an API
tags: aws, lambda, graphql, typescript
cover_image: https://dev-to-uploads.s3.amazonaws.com/uploads/articles/hpg7agsxvd980kparz7t.jpeg
---

In our current scenario we need to provide a GraphQL API that allows users to create new tasks and get the list of tasks they created.

We have two functionalities in our api, addTask and getTasks, both of them need an authenticated user, also it is important to mention that we need to store the data in a database.

In order to solve our current scenario we are going to use AWS IAM, Amazon Cognito, Amazon DynamoDB, AWS Lambda and AWS AppSync, to create our infrastructure we are using CDK (Cloud Development Kit) and TypeScript

# Requirements

- git
- NodeJS 14 or later, my version is v18.18.0
- An AWS account and configured credentials
- Install [cdk command](https://docs.aws.amazon.com/cdk/v2/guide/cli.html/)
- docker

# TL;DR;

Clone [the repo](https://github.com/kavichu/aws-appsync-typescript) and follow the instructions to the deploy the project, you can use the gitpod configuration which comes with nodejs, aws cli v2, docker and cdk installed

# Architecture

Here is an overview of the architecture.

![Architecture](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/phojbbbjkyrapon0brer.png)

Now let’s jump into the details of the different services we defined in our architecture.

**AWS Identity and Access Management (IAM)** is a web service that helps you securely control access to AWS resources. With IAM, you can centrally manage permissions that control which AWS resources users can access. You use IAM to control who is authenticated (signed in) and authorized (has permissions) to use resources.

**Amazon Cognito** delivers frictionless customer identity and access management (CIAM) with a cost-effective and customizable platform that allows you to implement secure, frictionless customer identity and access management that scales.

**Amazon DynamoDB** is a serverless, NoSQL, fully managed database service with single-digit millisecond response times at any scale, enabling you to develop and run modern applications while only paying for what you use.

**AWS Lambda** runs code without provisioning or managing servers, creating workload-aware cluster scaling logic, maintaining event integrations, or managing runtimes.

**AWS AppSync** simplifies application development with GraphQL APIs by providing a single endpoint to securely query or update data from multiple databases, microservices, and APIs.

Now that we have the concepts for the services built up we can start to take a look at the details of the implementation of the infrastructure using CDK (Cloud Development Kit)

# Creating a DynamoDB table with a global secondary index

We want to create a table to store the data from the Tasks, so we will create such table using the CfnTable construct from module dynamodb.

On the keySchema will will only have the attribute id as type of hash, also there is attribute definitions where we have id as string and owner as string. The billing mode is Pay per Request.

The global secondary index name is byOwner, where the key schema has owner as hash and id as range as key type, this means that we will be able to make a query on the index byOwner using the field owner to retrieve the results sorted by the field id, another thing to point out is that the projectionType is ALL, which will retrieve all fields from each record

```typescript
const cfnTaskTable = new dynamodb.CfnTable(this, 'CfnTasksTable', {
    keySchema: [{
      attributeName: 'id',
      keyType: 'HASH',
    }],
    attributeDefinitions: [
      {
        attributeName: 'id',
        attributeType: 'S',
      },
      {
        attributeName: 'owner',
        attributeType: 'S',
      }
    ],
    billingMode: 'PAY_PER_REQUEST',
    globalSecondaryIndexes: [
      {
        indexName: 'byOwner',
        keySchema: [
          {
            attributeName: 'owner',
            keyType: 'HASH',
          },
          {
            attributeName: 'id',
            keyType: 'RANGE',
          }
        ],
        projection: {
          projectionType: 'ALL',
        },
      }
    ],
  });

const taskTable = dynamodb.Table.fromTableArn(this, 'TasksTable', cfnTaskTable.attrArn)
```

We need the table name which will be generated at deployment time, while I was building this project, the table name returned by CfnTable was null, but it returned a valid when calling attrArn, so by having the arn of the table is possible to retrieve its the construct of the table by calling dynamodb.Table.fromTableArn and store it in variable taskTable.

# Creating a user pool and user pool client

Inside the Amazon Cognito service we are going to create a resource called user pool, which is a user directory for web and mobile app authentication and authorization.

Another resource that is created is a user pool client which is a configuration within a user pool that interacts with mobile or web application that authenticates with Amazon Cognito.

A web application will use the user pool client id to interact with the cognito user pool.

Another detail to point out is that our UserPool configuration for password policy is weak, only for development purposes.

```typescript
const userPool = new cognito.UserPool(this, 'UserPool',
  {
    signInAliases: {
      email: true ,
      username: false
    },
    autoVerify: {
        email: true
    },
    passwordPolicy: {
      minLength: 8,
      requireLowercase: false,
      requireUppercase: false,
      requireDigits: false,
      requireSymbols: false,
    },
  }
);

const userPoolClient = userPool.addClient('UserPoolClient', {
  userPoolClientName: 'web'
})
```

# Creating the GraphQL API

In order to create our graphql api we will use the GraphqlApi construct from the appsync module, there are many configurations for it but in our current scenario we will only provide a name, a schema and an authorizationConfig where we are going to use the User Pool authorization tipe and provide the user pool we created before as a param for the userPoolConfig

```typescript
const graphqlApi = new appsync.GraphqlApi(this, 'AppSyncApi', {
  name: 'todos-api',
  definition: appsync.Definition.fromFile(path.join(__dirname, '../schema.graphql')),
  authorizationConfig: {
    defaultAuthorization: {
      authorizationType: appsync.AuthorizationType.USER_POOL,
      userPoolConfig: {
        userPool: userPool
      }
    }
  }
});
```

The schema of our graphql api is loaded in the definition parameter, this is what it looks like, we have one type, one input that is used in a mutation, we have the Query getTasks and the Mutation addTask, we will see their resolvers later on

```graphql
type Task {
  id: ID!
  text: String!
  owner: ID!
  createdAt: String!
}

type TaskConnection {
 items: [Task!]
 nextToken: String
}

input TaskInput {
  text: String!
}

type Query {
  getTasks(limit: Int, nextToken: String): TaskConnection!
}

type Mutation {
  addTask(input: TaskInput!): Task!
}
```


# Lambda execution role

We are going to create a lambda function that will write data to a dynamodb table, in order for the function to be able to put an item in the table, it needs permissions, we provide this permission to the function using an IAM Role, our lambda role has the permission to be assumed by the lambda service, also has a managed policy AWSLambdaBasicExecutionRole.

Last thing we have is the taskTable grating access to read and write to the lambda role

```typescript
const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
  ]
})
taskTable.grantReadWriteData(lambdaRole)
```


# Task data source role

The task data source role will be assumed by appync service to run the JavaScript resolver code, the code uses an index called byOwner, to give access to this index we create a policy.

We use taskTable to grant read and write permissions to the task datasource role and attach an inline policy for the index policy.

```typescript
const tasksDataSourceRole = new iam.Role(this, 'TasksDataSourceRole', {
  assumedBy: new iam.ServicePrincipal('appsync.amazonaws.com')
})
taskTable.grantReadWriteData(tasksDataSourceRole)

const queryIndexPolicy = new iam.Policy(this, "QueryIndexByOwnerPolicy", {
  policyName: "QueryIndexByOwnerPolicy",
  statements: [
    iam.PolicyStatement.fromJson({
        Effect: 'Allow',
        Action: 'dynamodb:Query',
        Resource: `${taskTable.tableArn}/index/byOwner`
    })
  ]
})
tasksDataSourceRole.attachInlinePolicy(queryIndexPolicy)
```

# Create a dynamodb datasource

To create our dynamodb data source we are going to use the taskTable, the taskDataSourceRole we created earlier and our graphqlApi

```typescript
const taskTableDataSource = new appsync.DynamoDbDataSource(this, 'TaskTableDataSource', {
  table: taskTable,
  serviceRole: tasksDataSourceRole,
  api: graphqlApi
})
```

# Create a JavaScript resolver

We are going to create a resolver using our taskTableDataSource, this resolver has for fieldName 'getTasks', typename 'Query', the code is loaded from a local filesystem and the runtime is JS_1_0_0

```typescript
taskTableDataSource.createResolver('getTasksResolver', {
  fieldName: 'getTasks',
  typeName: 'Query',
  code: appsync.Code.fromAsset(path.join(__dirname, '../resolvers/getTasks.js')),
  runtime: appsync.FunctionRuntime.JS_1_0_0
})
```

Before [17 November 2022](https://aws.amazon.com/blogs/aws/aws-appsync-graphql-apis-supports-javascript-resolvers/) the only way to write resolvers was using Apache Velocity Template Language (VTL), while writing mapping templates for resolvers I learned it requires more effort when debugging, having JavaScript opens more possibilities.

Now lets take a look at our JavaScript resolver, the value that is returned follows a syntax from DynamoDB resolver, [the Query request mapping document](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html#aws-appsync-resolver-mapping-template-reference-dynamodb-query) lets you tell the AWS AppSync DynamoDB resolver to make a Query request to DynamoDB, one thing to point out is that we are using the byOwner index that we created with our dynamodb table tasksTable, this query will return the tasks created by the current authenticated user, the field :userId will have the value of context.identity.username, which is the id of the user in the Cognito User Pool

```javascript
import { util } from '@aws-appsync/utils';

export function request(context) {
  return {
      operation: "Query",
      query: {
          expression: "#owner = :userId",
          expressionNames: {
            "#owner": "owner"
          },
          expressionValues: {
              ":userId": util.dynamodb.toDynamoDB(context.identity.username)
          }
      },
      index: "byOwner",
      nextToken: context.arguments.nextToken,
      limit: context.arguments.limit,
      scanIndexForward: true, // true order ASC, false order DESC
      consistentRead: false,
      select: "ALL_ATTRIBUTES"
  }
}

export function response(context) {
  return {
    items: context.result.items,
    nextToken: context.result.nextToken
  }
}
```

When the request resolver is called, in the cloudwatch logs of the resolver it is possible to see the field :userId with a value:

![Query](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/oa774tps8hxg3euqgght.jpeg)

# Create a NodeJS Function

To create our addTask function we are going to use the NodejsFunction construct where we are providing a path to the source code to the parameter entry, inside bundling we are adding ulid module as dependency, among other parameters we have the handler which is the name of the exported function that will be called, in the environment we are passing TASK_TABLE from the taskTable construct using its tableName attribute, this environment variable is used inside the code of the function, other important parameter is the role, we are using the lambdaRole we creater previously, and finally we add a timeout of 30 seconds which is the maximum amount of time a function can run in AppSync.

```typescript
const addTask = new lambda_nodejs.NodejsFunction(this, "AddTaskLambdaFunction", { 
  entry: path.join(__dirname, '../functions/addTask/index.ts'),
  bundling: {
    nodeModules: ['ulid'],
  },
  projectRoot: path.join(__dirname, '../functions/addTask'),
  depsLockFilePath: path.join(__dirname, '../functions/addTask/package-lock.json'),
  handler: 'addTask',
  runtime: lambda.Runtime.NODEJS_20_X,
  environment: {
    'TASKS_TABLE': taskTable.tableName
  },
  role: lambdaRole,
  timeout: cdk.Duration.seconds(30)
})
```

The source code for the function is, we use aws sdk javascript v3 libraries that are part of the lambda runtime, the library we added is ulid, ULID is a universally unique lexicographically sortable identifier, it generates a string that is random and can be sorted, different from uuids

```typescript
import { AppSyncResolverEvent , AppSyncIdentityCognito} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ulid }  from 'ulid'

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

type InputArguments = {
  input: {
    text: String
  }
}

export const addTask = async (event: AppSyncResolverEvent<InputArguments> ) => {
  
  const id  = ulid()
  const createdAt = new Date().toJSON()
  const identity = event.identity as AppSyncIdentityCognito

  const data = {
    id,
    owner: identity.username,
    text: event.arguments.input.text,
    createdAt
  }
  const command = new PutCommand({
    TableName: process.env.TASKS_TABLE,
    Item: data
  });

  const response = await documentClient.send(command);
  console.log(response)

  return data
}
```

# Lambda Data Source

To be able to user our lambda function addTask, we need to create a data source using the construct LambdaDataSource and provide graphqlApi as api, and addTask as lambdaFunction parameters.

```typescript
const lambdaDataSource = new appsync.LambdaDataSource(this, "AddTaskDataSource", {
  api: graphqlApi,
  lambdaFunction: addTask
})
```

# Create resolver for lambda data source

Then we use our lambda data source to create a resolver, which in this case is of typeName Mutation with the fieldName "addTask", the mapping templates are the default ones for lambda data sources.

```typescript
lambdaDataSource.createResolver("AddTaskResolver", {
  typeName: 'Mutation',
  fieldName: 'addTask',
  requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
  responseMappingTemplate: appsync.MappingTemplate.lambdaResult()
})
```

# Deploying the project

Clone [the repo](https://github.com/kavichu/aws-appsync-typescript) and follow the instructions to the deploy the project.

# How to test the project

Open your AWS console, the first thing we need to is to create an user in our user pool, to do that we are going to the search bar and search for cognito

![Cognito](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/xmyx0ai59myf2s4fuq6r.jpeg)

Click on the User Pool we created using CDK

![User Pool](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/u5mwgsmk5r8wlwe96lot.jpeg)

Once in the details page of the user pool, click on create user, fill the user email and mark as verified, last fill a password for the user, you will need this credentials later on.

![Create User](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/5a30aebyhhvrz0t4fnn4.jpeg)

Now open the search bar and search for appsync

![Appsync](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/zfbd6xpcn2zy42nfk90y.jpeg)

On the list, select the todos-api and once on the details page for the api, on the left bar, go to the menu Queries and click in Login with User Pools

![Login](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/67lpeobihitnrwo6ovtf.jpeg)

Select the client ID that is available and login with the user created in the previous step.

![Login User Pool](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/kx1pehrwrzqcng892qnq.jpeg)

We want to create a task, in the explorer select query and change for mutation then click on the + plus button, choose the addTask and click on the input text, in the example text is Hello World then click on Run MyMutation

![Run Mutation](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/3ztvw5shezl3dmp4v5d8.jpeg)

When you run the mutation you will have a result like this one

![Result](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/1ssi4fxmub14u08hp92n.jpeg)

Now go to the explorer and change the mutation to query and click on + plus, click on getTasks and click on all fields, then run MyQuery

![Run Query](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/blb9o4xe92rl1ygolu0u.jpeg)

# Conclusion and next steps

This introduction to AWS AppSync and how to create resolvers for queries and mutations will enable you to extend the project with your own ideas in case you need a solution as the one provided in this article.

The next steps will be to add a frontend application, which I will do it in a future publication.