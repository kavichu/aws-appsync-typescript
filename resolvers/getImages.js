import * as dynamodb from '@aws-appsync/utils/dynamodb'

export function request(context) {

  if(context.arguments.limit > 25 ) {
    util.error("max length is 25")
  }

  const payload = {
    filter: {
      "status": {
        "eq": "public"
      }
    },
    limit: context.arguments.limit,
    nextToken: context.arguments.nextToken,
    consistentRead: false,
    select: "ALL_ATTRIBUTES",
    scanIndexForward: false
  }

  return dynamodb.scan(
    payload
  )
}

export function response(context) {
  return {
    items: context.result.items,
    nextToken: context.result.nextToken
  }
}
