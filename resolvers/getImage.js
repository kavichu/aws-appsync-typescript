import * as dynamodb from '@aws-appsync/utils/dynamodb'

export function request(context) {
  const response = dynamodb.get({ key: { id: context.arguments.imageId } });
  return response
}

export function response(context) {
  return context.result
}
