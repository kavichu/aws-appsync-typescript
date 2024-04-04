#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { IAMStack } from '../lib/iam-stack';
import { S3Stack } from '../lib/s3-stack';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { CognitoStack } from '../lib/cognito-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { AppSyncStack } from '../lib/appsync-stack';

const app = new cdk.App();

const iamStack = new IAMStack(app, "IAMStack", {});

const dynamodbStack = new DynamoDBStack(app, "DynamoDBStack", {
  lambdaExecutionRole: iamStack.lambdaExecutionRole,
  appSyncDataSourceRole: iamStack.appSyncDataSourceRole,
});

const s3Stack = new S3Stack(app, "S3Stack", {
  // lambdaExecutionRole: iamStack.lambdaExecutionRole,
  // imagesTableName: dynamodbStack.imagesTable.tableName
});

const lambdaStack = new LambdaStack(app, "LambdaStack", {
  tweetsTableName: dynamodbStack.tweetsTable.tableName,
  usersTableName: dynamodbStack.usersTable.tableName,
  imagesTableName: dynamodbStack.imagesTable.tableName,
  // assetsBucket: s3Stack.assetsBucket,
  lambdaExecutionRole: iamStack.lambdaExecutionRole,
});
lambdaStack.addDependency(s3Stack)

const cognitoStack = new CognitoStack(app, "CognitoStack", {
  lambdaStack: lambdaStack,
});

new AppSyncStack(app, 'AppSyncStack', {
  userPool: cognitoStack.userPool,
  userPoolClient: cognitoStack.userPoolClient,
  lambdaExecutionRole: iamStack.lambdaExecutionRole,
  appSyncDataSourceRole: iamStack.appSyncDataSourceRole,
  tweetsTable: dynamodbStack.tweetsTable,
  imagesTable: dynamodbStack.imagesTable,
  lambdaStack: lambdaStack,
});