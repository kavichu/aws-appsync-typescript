import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib';

interface DynamoDBStackProps extends cdk.StackProps {
  readonly lambdaExecutionRole: iam.Role
  readonly appSyncDataSourceRole: iam.Role
}

export class DynamoDBStack extends cdk.Stack {

  public usersTable: dynamodb.ITable
  public tweetsTable: dynamodb.ITable
  public imagesTable: dynamodb.ITable

  constructor(scope: Construct, id: string, props?: DynamoDBStackProps) {
    super(scope, id, props);

    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
    });
    this.usersTable.grantReadWriteData(props?.lambdaExecutionRole!)

    const cfnTweetsTable = new dynamodb.CfnTable(this, 'TweetsTable', {
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

    this.tweetsTable = dynamodb.Table.fromTableArn(this, 'TweetsTableProxy', cfnTweetsTable.attrArn)
    this.tweetsTable.grantReadWriteData(props?.lambdaExecutionRole!)
    this.tweetsTable.grantReadWriteData(props?.appSyncDataSourceRole!)
    
    const cfnImagesTable = new dynamodb.CfnTable(this, 'CfnImagesTable', {
      keySchema: [
        {
          attributeName: 'id',
          keyType: 'HASH',
        },
        {
          attributeName: 'createdAt',
          keyType: 'RANGE',
        }
      ],
      attributeDefinitions: [
        {
          attributeName: 'id',
          attributeType: 'S',
        },
        {
          attributeName: 'owner',
          attributeType: 'S',
        },
        {
          attributeName: 'createdAt',
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

    this.imagesTable = dynamodb.Table.fromTableArn(this, 'ImagesTableProxy', cfnImagesTable.attrArn)
    this.imagesTable.grantReadWriteData(props?.lambdaExecutionRole!)
    this.imagesTable.grantReadWriteData(props?.appSyncDataSourceRole!)

  }
}
