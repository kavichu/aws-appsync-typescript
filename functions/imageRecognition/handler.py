import io
import os
import pathlib
import json
import uuid
import base64
import logging
import decimal
from datetime import datetime
import boto3
from PIL import Image, ImageDraw, ImageFont
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError


# Set up logging.
logger = logging.getLogger(__name__)

rekognition = boto3.client('rekognition')
lambda_client = boto3.client('lambda')
sqs_client = boto3.client('sqs')
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.resource('s3')

assets_bucket = s3_client.Bucket(os.environ['ASSETS_BUCKET'])
images_table = dynamodb.Table(os.environ["IMAGES_TABLE"])


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return str(o)
        return super(DecimalEncoder, self).default(o)


def map_label(label):
    """map a label object to use lowecase key names"""
    def map_instance(instance):
        result = {
            "confidence": instance["Confidence"],
            "boundingBox": {
                "height": instance["BoundingBox"]["Height"],
                "left": instance["BoundingBox"]["Left"],
                "top": instance["BoundingBox"]["Top"],
                "width": instance["BoundingBox"]["Width"],
            }
        }
        return result
    def map_key_value(item):
        return {
            "name": item["Name"]
        }
    result = {
        "name": label["Name"],
        "confidence": label["Confidence"],
        "instances": [map_instance(instance) for instance in label["Instances"]],
        "parents": [map_key_value(item) for item in label["Parents"]],
        "categories": [map_key_value(item) for item in label["Categories"]],
    }
    return result


def intersection(lst1, lst2):
    """intersection of two lists"""
    return list(set(lst1) & set(lst2))


def detect_image_labels(event, _):
    """detect labels"""
    print("event: ", event)

    object_key = event["Records"][0]["s3"]["object"]["key"]

    image_id = pathlib.Path(object_key).stem
    file_extension = pathlib.Path(object_key).suffix.replace('.', '')

    # Read the logo from s3
    image_buffer = io.BytesIO()
    image_key = f"images/{image_id}.{file_extension}"
    assets_bucket.download_fileobj(image_key, image_buffer)
    image_buffer.seek(0)

    # Upload image to AWS
    response = rekognition.detect_labels(Image={'Bytes': image_buffer.read()})

    labels = [
        map_label(label) for label in response['Labels']
    ]

    # Get the original image from dynamodb
    response = images_table.query(
        KeyConditionExpression=Key("id").eq(image_id)
    )

    # Add the labels to the original image
    original_image = response["Items"][0]
    print("original_image= ", original_image)
    original_image["labels"] = labels
    del  original_image["fields"]

    print("labels= ", labels)
    print("original_image= ", original_image)

    original_image = json.loads(json.dumps(original_image, cls=DecimalEncoder), parse_float=decimal.Decimal)
    try:
        print("original_image: ", original_image)
        print("original_image: ", original_image)
        response = images_table.put_item(Item=original_image)
        print("images_table.put_item(Item=original_image)", response)
    except ClientError as error:
        print("images_table.put_item error: ", error)

    return {'statusCode': 200 }