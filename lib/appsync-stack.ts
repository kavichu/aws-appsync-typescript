import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib';
import { aws_cognito as cognito } from 'aws-cdk-lib';
import { aws_appsync as appsync } from 'aws-cdk-lib';
import { aws_lambda_nodejs as lambda_nodejs } from 'aws-cdk-lib'
import { aws_lambda as lambda } from 'aws-cdk-lib'
import * as path from 'path'

export class AppSyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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

    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    })
    taskTable.grantReadWriteData(lambdaRole)
    
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

    const taskTableDataSource = new appsync.DynamoDbDataSource(this, 'TaskTableDataSource', {
      table: taskTable,
      serviceRole: tasksDataSourceRole,
      api: graphqlApi
    })

    taskTableDataSource.createResolver('getTasksResolver', {
      fieldName: 'getTasks',
      typeName: 'Query',
      code: appsync.Code.fromAsset(path.join(__dirname, '../resolvers/getTasks.js')),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    })

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

    const lambdaDataSource = new appsync.LambdaDataSource(this, "AddTaskDataSource", {
      api: graphqlApi,
      lambdaFunction: addTask
    })

    lambdaDataSource.createResolver("AddTaskResolver", {
      typeName: 'Mutation',
      fieldName: 'addTask',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult()
    })

  }
}
