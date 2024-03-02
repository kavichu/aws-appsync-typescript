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
      scanIndexForward: true, // true order ASC, false order DESC
      consistentRead: false,
      select: "ALL_ATTRIBUTES"
  }
}

export function response(context) {
  return context.result.items
}
