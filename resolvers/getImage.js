import * as dynamodb from '@aws-appsync/utils/dynamodb'

export function request(context) {
  return dynamodb.get({ key: { id: context.arguments.imageId } });
}

export function response(context) {
  return context.result
}
