import io
import os
import pathlib
import json
import uuid
from datetime import datetime
from botocore.exceptions import ClientError
from tempfile import SpooledTemporaryFile
import boto3
from PIL import Image, ImageFilter, ImageOps
from boto3.dynamodb.conditions import Key, Attr
from botocore.paginate import TokenEncoder
import blurhash


s3 = boto3.resource('s3')
dynamodb = boto3.resource('dynamodb')
rekognition = boto3.client('rekognition')
lambda_client = boto3.client('lambda')


def blur_image(image_data, file_format):
    """blur_image"""
    img = Image.open(io.BytesIO(image_data))
    blurred = img.filter(ImageFilter.GaussianBlur(32))

    blurred_byte_arr = io.BytesIO()
    blurred.save(blurred_byte_arr, format=file_format)
    return blurred_byte_arr.getvalue()


def detect_moderation_labels(event, _):
    """detect_moderation_labels"""
    print("event: ", event)
    # extensions = ['/jpg', '/jpeg', '/png']
    # trigger /uploads/images/{image_id}.[image_extension]
    object_key = event["Records"][0]["s3"]["object"]["key"]

    file_extension = pathlib.Path(object_key).suffix.replace('.', '')
    image_id = pathlib.Path(object_key).stem

    assets_bucket = s3.Bucket(os.environ['ASSETS_BUCKET'])
    images_table = dynamodb.Table(os.environ["IMAGES_TABLE"])

    try:
        # Read the original image from s3
        image_file = SpooledTemporaryFile()
        image_key = f"uploaded-images/{image_id}.{file_extension}"
        assets_bucket.download_fileobj(image_key, image_file)
        image_file.seek(0)

        print("#####image_key: ", image_key)

        # get size of original image
        original_image = Image.open(io.BytesIO(image_file.read()))
        width, height = original_image.size

        # Resize original image
        base_width = 960
        width_percent = base_width / float(original_image.size[0])
        height_size = int((float(original_image.size[1]) * float(width_percent)))
        original_image = original_image.resize((base_width, height_size), Image.Resampling.LANCZOS)
        width = base_width
        height = height_size

        # Set correct image orientation
        transposed_image = ImageOps.exif_transpose(original_image)
        image_file.seek(0)
        transposed_image.save(image_file, "png")
        image_file.seek(0)

        # Image to bytes
        image_bytes = image_file.read()

        print("#####image_bytes: ", len(image_bytes))

        # Detect moderation content in the image with Rekognition
        response = rekognition.detect_moderation_labels(
          Image={
            'Bytes': image_bytes
          },
          MinConfidence=50
        )

        # Blur the image if moderation labels are present
        labels = response['ModerationLabels']
        print("labels: ", labels)

        if len(labels):
            print("labels = ", labels)
            image_bytes = blur_image(image_bytes, file_extension)

            # save as public image
            image_file = SpooledTemporaryFile()
            image = Image.open(io.BytesIO(image_bytes))
            image.save(image_file, "png")
            image_file.seek(0)

            # Upload image to S3 with public read access
            extra_args = {
                'ACL': 'public-read',
                'ContentType': "image/png"
            }
            image_key = f"images/{image_id}.png"
            assets_bucket.upload_fileobj(
                image_file, image_key, ExtraArgs=extra_args)
            print("assets_bucket.upload_fileobj: ", True)

            public_image_url = f"https://{os.environ['ASSETS_BUCKET']}.s3.amazonaws.com/{image_key}"

            print("public_image_url: ", public_image_url)

            response = images_table.query(
                KeyConditionExpression=Key("id").eq(image_id)
            )

            image = response["Items"][0]
            image["status"] = "public"
            image["url"] = public_image_url

            images_table.put_item(Item=image)

            print("images_table.put_item(Item=image): ", image)
        else:
            # Upload image to S3 with public read access
            extra_args = {
                'ACL': 'public-read',
                'ContentType': "image/png"
            }
            # set the cursor to the start of the file
            image_file.seek(0)
            image_key = f"images/{image_id}.png"
            assets_bucket.upload_fileobj(
                image_file, image_key, ExtraArgs=extra_args)

            public_image_url = f"https://{os.environ['ASSETS_BUCKET']}.s3.amazonaws.com/{image_key}"

            print("public_image_url: ", public_image_url)
            response = images_table.query(
                KeyConditionExpression=Key("id").eq(image_id)
            )

            image = response["Items"][0]
            image["status"] = "public"
            image["url"] = public_image_url
            image["width"]= width
            image["height"]= height
            with Image.open(io.BytesIO(image_bytes)) as image_file:
                image_blur_hash = blurhash.encode(image_file, x_components=4, y_components=4)
                image["blurhash"]= image_blur_hash

            images_table.put_item(Item=image)

            print("images_table.put_item(Item=image): ", image)

            print("response: ", response)

    except ClientError as error:
        print("error: ", error)

    return {'statusCode': 200 }