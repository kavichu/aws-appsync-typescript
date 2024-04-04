import * as cdk from 'aws-cdk-lib';
import * as path from 'path'
import { Construct } from 'constructs';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib';
import { aws_cognito as cognito } from 'aws-cdk-lib';
import { aws_appsync as appsync } from 'aws-cdk-lib';
import { aws_ssm as ssm } from 'aws-cdk-lib'
import { LambdaStack } from './lambda-stack';

interface AppSyncStackProps extends cdk.StackProps {
  readonly userPool: cognito.UserPool
  readonly userPoolClient: cognito.UserPoolClient
  readonly lambdaExecutionRole: iam.Role
  readonly appSyncDataSourceRole: iam.Role
  readonly tweetsTable: dynamodb.ITable
  readonly imagesTable: dynamodb.ITable
  readonly lambdaStack: LambdaStack
}

export class AppSyncStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: AppSyncStackProps) {
    super(scope, id, props);

    const graphqlApi = new appsync.GraphqlApi(this, 'AppSyncApi', {
      name: 'serverless-api',
      definition: appsync.Definition.fromFile(path.join(__dirname, '../schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: props?.userPool!
          }
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.IAM,
          }
        ]
      }
    });

    const queryIndexPolicy = new iam.Policy(this, "QueryIndexByOwnerPolicy", {
      policyName: "QueryIndexByOwnerPolicy",
      statements: [
        iam.PolicyStatement.fromJson({
            Effect: 'Allow',
            Action: 'dynamodb:Query',
            Resource: `${props?.tweetsTable.tableArn}/index/byOwner`
        })
      ]
    })
    props?.appSyncDataSourceRole!.attachInlinePolicy(queryIndexPolicy)

    const tweetsTableDataSource = new appsync.DynamoDbDataSource(this, 'TweetsTableDataSource', {
      table: props?.tweetsTable!,
      serviceRole: props?.appSyncDataSourceRole!,
      api: graphqlApi
    })

    tweetsTableDataSource.createResolver('getTweetsResolver', {
      fieldName: 'getTweets',
      typeName: 'Query',
      code: appsync.Code.fromAsset(path.join(__dirname, '../resolvers/getTasks.js')),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    })

    const tweetDataSource = new appsync.LambdaDataSource(this, "TweetDataSource", {
      api: graphqlApi,
      lambdaFunction: props?.lambdaStack.tweet!
    })

    tweetDataSource.createResolver("TweetResolver", {
      typeName: 'Mutation',
      fieldName: 'tweet',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult()
    })

    new ssm.StringParameter(this, "GraphQLEndpointUrlParameter", {
        parameterName: "/Application/GraphQLEndpointUrl",
        stringValue: graphqlApi.graphqlUrl
      }
    )


    const getImageUploadUrlDataSource = new appsync.LambdaDataSource(this, "GetImageUploadUrlDataSource", {
      api: graphqlApi,
      lambdaFunction: props?.lambdaStack.getImageUploadUrl!
    })

    getImageUploadUrlDataSource.createResolver("GetImageUploadUrlResolver", {
      typeName: 'Query',
      fieldName: 'getImageUploadUrl',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult()
    })

    const imagesQueryIndexPolicy = new iam.Policy(this, "ImagesQueryIndexByOwnerPolicy", {
      policyName: "ImagesQueryIndexByOwnerPolicy",
      statements: [
        iam.PolicyStatement.fromJson({
            Effect: 'Allow',
            Action: 'dynamodb:Query',
            Resource: `${props?.imagesTable.tableArn}/index/byOwner`
        }),
        iam.PolicyStatement.fromJson({
          Effect: 'Allow',
          Action: 'dynamodb:Scan',
          Resource: `${props?.imagesTable.tableArn}`
        })
      ]
    })
    props?.appSyncDataSourceRole.attachInlinePolicy(imagesQueryIndexPolicy)

    const imagesTableDataSource = new appsync.DynamoDbDataSource(this, 'ImagesTableDataSource', {
      table: props?.imagesTable!,
      serviceRole: props?.appSyncDataSourceRole,
      api: graphqlApi
    })

    imagesTableDataSource.createResolver('getImagesResolver', {
      fieldName: 'getImages',
      typeName: 'Query',
      code: appsync.Code.fromAsset(path.join(__dirname, '../resolvers/getImages.js')),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    })

    imagesTableDataSource.createResolver('getImageResolver', {
      fieldName: 'getImage',
      typeName: 'Query',
      code: appsync.Code.fromAsset(path.join(__dirname, '../resolvers/getImage.js')),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    })

  }
}
