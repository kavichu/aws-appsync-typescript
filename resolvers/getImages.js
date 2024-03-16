import * as dynamodb from '@aws-appsync/utils/dynamodb'

export function request(context) {

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
    scanIndexForward: true
  }

  const response = dynamodb.scan(
    payload
  )

  return response
}

export function response(context) {
  return {
    items: context.result.items,
    nextToken: context.result.nextToken
  }
}
