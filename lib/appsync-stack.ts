import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib';
import { aws_cognito as cognito } from 'aws-cdk-lib';
import { aws_appsync as appsync } from 'aws-cdk-lib';
import { aws_lambda_nodejs as lambda_nodejs } from 'aws-cdk-lib'
import { aws_lambda as lambda } from 'aws-cdk-lib'
import { aws_ssm as ssm } from 'aws-cdk-lib'
import { aws_s3 as s3 } from 'aws-cdk-lib'
import * as path from 'path'
import { BlockPublicAccess } from 'aws-cdk-lib/aws-s3';

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

    const cfnImagesTable = new dynamodb.CfnTable(this, 'CfnImagesTable', {
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

    const imagesTable = dynamodb.Table.fromTableArn(this, 'ImagesTable', cfnImagesTable.attrArn)

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
        selfSignUpEnabled: true,
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

    new cdk.CfnOutput(this, 'GRAPHQLENDPOINT', { value: graphqlApi.graphqlUrl });

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

    new ssm.StringParameter(this, "UserPoolIdParameter", {
        parameterName: "/Application/UserPoolId",
        stringValue: userPool.userPoolId
      }
    )

    new ssm.StringParameter(this, "UserPoolClientIdParameter", {
        parameterName: "/Application/UserPoolClientId",
        stringValue: userPoolClient.userPoolClientId
      }
    )

    new ssm.StringParameter(this, "GraphQLEndpointUrlParameter", {
        parameterName: "/Application/GraphQLEndpointUrl",
        stringValue: graphqlApi.graphqlUrl
      }
    )

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
    });
    usersTable.grantReadWriteData(lambdaRole)

    const postConfirmation = new lambda_nodejs.NodejsFunction(this, "PostConfirmationLambdaFunction", { 
      entry: path.join(__dirname, '../functions/postConfirmation/index.ts'),
      handler: 'postConfirmation',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        'USERS_TABLE': usersTable.tableName
      },
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30)
    })

    userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, 
      postConfirmation
    );

    const assets_bucket = new s3.Bucket(this, 'AssetsBucket',
     {
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      blockPublicAccess: new s3.BlockPublicAccess({ blockPublicAcls: false }),
      cors: [
        {
          id: "corsRule",
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
          allowedHeaders: ['*'],
          allowedOrigins: ['*'],
          exposedHeaders: [
            "Access-Control-Allow-Origin"
          ]
        } as s3.CorsRule
      ]
     }
    );
    assets_bucket.grantPut(lambdaRole)
    imagesTable.grantWriteData(lambdaRole)

    const getImageUploadUrl = new lambda_nodejs.NodejsFunction(this, "GetPresignedImageUrlLambdaFunction", {
      entry: path.join(__dirname, '../functions/createPresignedPost/index.ts'),
      bundling: {
        nodeModules: ['ulid'],
      },
      projectRoot: path.join(__dirname, '../functions/createPresignedPost'),
      depsLockFilePath: path.join(__dirname, '../functions/createPresignedPost/package-lock.json'),
      handler: 'getImageUploadUrl',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        IMAGES_TABLE: imagesTable.tableName,
        ASSETS_BUCKET: assets_bucket.bucketName,
      },
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30)
    })

    const getImageUploadUrlDataSource = new appsync.LambdaDataSource(this, "GetImageUploadUrlDataSource", {
      api: graphqlApi,
      lambdaFunction: getImageUploadUrl
    })

    getImageUploadUrlDataSource.createResolver("GetImageUploadUrlResolver", {
      typeName: 'Query',
      fieldName: 'getImageUploadUrl',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult()
    })

  }
}
