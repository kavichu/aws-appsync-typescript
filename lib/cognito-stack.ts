import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ssm as ssm } from 'aws-cdk-lib'
import { aws_cognito as cognito } from 'aws-cdk-lib';
import { LambdaStack } from './lambda-stack';

interface CognitoStackProps extends cdk.StackProps {
  readonly lambdaStack: LambdaStack
}


export class CognitoStack extends cdk.Stack {
  
  public userPool: cognito.UserPool
  public userPoolClient: cognito.UserPoolClient

  constructor(scope: Construct, id: string, props?: CognitoStackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'UserPool',
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

    this.userPoolClient = this.userPool.addClient('UserPoolClient', {
      userPoolClientName: 'web'
    })

    new ssm.StringParameter(this, "UserPoolIdParameter", {
      parameterName: "/Application/UserPoolId",
      stringValue: this.userPool.userPoolId
    }
  )

  new ssm.StringParameter(this, "UserPoolClientIdParameter", {
      parameterName: "/Application/UserPoolClientId",
      stringValue: this.userPoolClient.userPoolClientId
    }
  )

  this.userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, 
    props?.lambdaStack.postConfirmation!
  );

  }
}
