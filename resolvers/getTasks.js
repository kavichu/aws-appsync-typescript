import { util } from '@aws-appsync/utils';

export function request(context) {

  if(context.arguments.limit > 25 ) {
    util.error("max length is 25")
  }

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
      nextToken: context.arguments.nextToken,
      limit: context.arguments.limit,
      scanIndexForward: true, // true order ASC, false order DESC
      consistentRead: false,
      select: "ALL_ATTRIBUTES"
  }
}

export function response(context) {
  return {
    items: context.result.items,
    nextToken: context.result.nextToken
  }
}
