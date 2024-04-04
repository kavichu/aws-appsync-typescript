import * as cdk from 'aws-cdk-lib';
import * as path from 'path'
import { Construct } from 'constructs';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_s3 as s3 } from 'aws-cdk-lib'
import * as ssm from 'aws-cdk-lib/aws-ssm';

import * as lambda_python from '@aws-cdk/aws-lambda-python-alpha'
import { aws_lambda as lambda_ } from 'aws-cdk-lib'
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';

interface S3StackProps extends cdk.StackProps {
  // readonly lambdaExecutionRole: iam.Role
  // readonly imagesTableName: string
}

export class S3Stack extends cdk.Stack {
  
  public assetsBucket: s3.Bucket

  constructor(scope: Construct, id: string, props?: S3StackProps) {
    super(scope, id, props);

    this.assetsBucket = new s3.Bucket(this, 'AssetsBucket',
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
   )

   new ssm.StringParameter(this, 'AssetsBucketArnParameter', {
      parameterName: '/AssetsBucket/Arn',
      stringValue: this.assetsBucket.bucketArn
   });


  //  this.assetsBucket.grantPut(props?.lambdaExecutionRole!)
  //  this.assetsBucket.grantPutAcl(props?.lambdaExecutionRole!)
  //  this.assetsBucket.grantReadWrite(props?.lambdaExecutionRole!)

  //   // Image moderation
  //   const imageModerationFunction = new lambda_python.PythonFunction(this, 'ImageModerationFunction', {
  //     entry: path.join(__dirname, '../functions/imageModeration'),
  //     // the runtime is for pillow https://pillow.readthedocs.io/en/latest/installation/platform-support.html
  //     runtime: lambda_.Runtime.PYTHON_3_9,
  //     index: 'handler.py',
  //     handler: 'detect_moderation_labels',
  //     environment: {
  //       IMAGES_TABLE: props?.imagesTableName!,
  //       ASSETS_BUCKET: this.assetsBucket.bucketName!
  //     },
  //     role: props?.lambdaExecutionRole!,
  //     timeout: cdk.Duration.seconds(60), // Task timed out after 30.07 seconds
  //     memorySize: 256,
  //   });

  //   this.assetsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new LambdaDestination(imageModerationFunction), { prefix: "uploaded-images/" })

  //   const imageRecognitionFunction = new lambda_python.PythonFunction(this, 'ImageRecognitionFunction', {
  //     entry: path.join(__dirname, '../functions/imageRecognition'),
  //     // the runtime is for pillow https://pillow.readthedocs.io/en/latest/installation/platform-support.html
  //     runtime: lambda_.Runtime.PYTHON_3_9,
  //     index: 'handler.py',
  //     handler: 'detect_image_labels',
  //     environment: {
  //       IMAGES_TABLE: props?.imagesTableName!,
  //       ASSETS_BUCKET: this.assetsBucket.bucketName!
  //     },
  //     role: props?.lambdaExecutionRole!,
  //     timeout: cdk.Duration.seconds(60), // Task timed out after 30.07 seconds
  //     memorySize: 256,
  //   });

  //   this.assetsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new LambdaDestination(imageRecognitionFunction), { prefix: "images/" })

  }
}