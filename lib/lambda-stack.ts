import * as cdk from 'aws-cdk-lib';
import * as path from 'path'
import { Construct } from 'constructs';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib'
import { aws_lambda_nodejs as lambda_nodejs } from 'aws-cdk-lib'
import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha'
import { aws_lambda as lambda_ } from 'aws-cdk-lib'
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';

import * as ssm from 'aws-cdk-lib/aws-ssm';


interface LambdaStackProps extends cdk.StackProps {
  readonly tweetsTableName: string
  readonly usersTableName: string
  readonly imagesTableName: string
  // readonly assetsBucket: s3.Bucket
  readonly lambdaExecutionRole: iam.Role
}

export class LambdaStack extends cdk.Stack {
  
  public tweet: lambda_nodejs.NodejsFunction
  public postConfirmation: lambda_nodejs.NodejsFunction
  public getImageUploadUrl: lambda_nodejs.NodejsFunction

  constructor(scope: Construct, id: string, props?: LambdaStackProps) {
    super(scope, id, props);

    this.tweet = new lambda_nodejs.NodejsFunction(this, "TweetLambdaFunction", { 
      entry: path.join(__dirname, '../functions/tweet/index.ts'),
      bundling: {
        nodeModules: ['ulid'],
      },
      projectRoot: path.join(__dirname, '../functions/tweet'),
      depsLockFilePath: path.join(__dirname, '../functions/tweet/package-lock.json'),
      handler: 'tweet',
      runtime: lambda_.Runtime.NODEJS_20_X,
      environment: {
        TWEETS_TABLE: props?.tweetsTableName!
      },
      role: props?.lambdaExecutionRole!,
      timeout: cdk.Duration.seconds(30)
    })

    
    const assetsBucketArn = ssm.StringParameter.valueForStringParameter(this, "/AssetsBucket/Arn");
    const assetsBucket = s3.Bucket.fromBucketArn(this, "AssetsBucketImport", assetsBucketArn)


    this.getImageUploadUrl = new lambda_nodejs.NodejsFunction(this, "GetUploadImageUrlLambdaFunction", {
      entry: path.join(__dirname, '../functions/createPresignedPost/index.ts'),
      bundling: {
        nodeModules: ['ulid'],
      },
      projectRoot: path.join(__dirname, '../functions/createPresignedPost'),
      depsLockFilePath: path.join(__dirname, '../functions/createPresignedPost/package-lock.json'),
      handler: 'getImageUploadUrl',
      runtime: lambda_.Runtime.NODEJS_20_X,
      environment: {
        IMAGES_TABLE: props?.imagesTableName!,
        ASSETS_BUCKET: assetsBucket.bucketName
      },
      role: props?.lambdaExecutionRole!,
      timeout: cdk.Duration.seconds(30)
    })

    // Cognito Trigger
    this.postConfirmation = new lambda_nodejs.NodejsFunction(this, "PostConfirmationLambdaFunction", { 
      entry: path.join(__dirname, '../functions/postConfirmation/index.ts'),
      handler: 'postConfirmation',
      runtime: lambda_.Runtime.NODEJS_20_X,
      environment: {
        USERS_TABLE: props?.usersTableName!
      },
      role: props?.lambdaExecutionRole!,
      timeout: cdk.Duration.seconds(30)
    })

    // Image moderation
    const imageModerationFunction = new lambda_python.PythonFunction(this, 'ImageModerationFunction', {
      entry: path.join(__dirname, '../functions/imageModeration'),
      // the runtime is for pillow https://pillow.readthedocs.io/en/latest/installation/platform-support.html
      runtime: lambda_.Runtime.PYTHON_3_9,
      index: 'handler.py',
      handler: 'detect_moderation_labels',
      environment: {
        IMAGES_TABLE: props?.imagesTableName!,
        ASSETS_BUCKET: assetsBucket.bucketName
      },
      role: props?.lambdaExecutionRole!,
      timeout: cdk.Duration.seconds(60), // Task timed out after 30.07 seconds
      memorySize: 256,
    });

    assetsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new LambdaDestination(imageModerationFunction), { prefix: "uploaded-images/" })

    const imageRecognitionFunction = new lambda_python.PythonFunction(this, 'ImageRecognitionFunction', {
      entry: path.join(__dirname, '../functions/imageRecognition'),
      // the runtime is for pillow https://pillow.readthedocs.io/en/latest/installation/platform-support.html
      runtime: lambda_.Runtime.PYTHON_3_9,
      index: 'handler.py',
      handler: 'detect_image_labels',
      environment: {
        IMAGES_TABLE: props?.imagesTableName!,
        ASSETS_BUCKET: assetsBucket.bucketName
      },
      role: props?.lambdaExecutionRole!,
      timeout: cdk.Duration.seconds(60), // Task timed out after 30.07 seconds
      memorySize: 256,
    });

    assetsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new LambdaDestination(imageRecognitionFunction), { prefix: "images/" })

  }

}