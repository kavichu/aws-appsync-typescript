import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_iam as iam } from 'aws-cdk-lib';

export class IAMStack extends cdk.Stack {
  
  public lambdaExecutionRole: iam.Role
  public appSyncDataSourceRole: iam.Role

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    })

    this.appSyncDataSourceRole = new iam.Role(this, 'AppSyncDataSourceRole', {
      assumedBy: new iam.ServicePrincipal('appsync.amazonaws.com')
    })

    this.lambdaExecutionRole.attachInlinePolicy(new iam.Policy(this, 'RekognitionDetectModerationLabelsPolicy', {
      statements: [new iam.PolicyStatement({
        actions: [
          'rekognition:DetectModerationLabels',
          'rekognition:DetectLabels'
        ],
        resources: ["*"],
      })],
    }));
  }
}
