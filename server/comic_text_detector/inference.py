import json
from comic_text_detector.basemodel import TextDetBase, TextDetBaseDNN
from tqdm import tqdm
import numpy as np
import cv2
import torch
from pathlib import Path
import torch
from comic_text_detector.utils.yolov5_utils import non_max_suppression
from comic_text_detector.utils.db_utils import SegDetectorRepresenter
from comic_text_detector.utils.imgproc_utils import letterbox, xyxy2yolo
from comic_text_detector.utils.textblock import group_output, visualize_textblocks
from comic_text_detector.utils.textmask import REFINEMASK_INPAINT, REFINEMASK_ANNOTATION
from pathlib import Path
from typing import Union
import io
import re
import base64
from PIL import Image

def image_to_data_url(image_path):
    with open(image_path, "rb") as image_file:
        # Read the file
        image_data = image_file.read()

        # Encode as base64
        base64_encoded = base64.b64encode(image_data).decode("utf-8")

        # Determine the file's mime type
        mime_type = ""
        if image_path.endswith(".png"):
            mime_type = "image/png"
        elif image_path.endswith(".jpg") or image_path.endswith(".jpeg"):
            mime_type = "image/jpeg"
        elif image_path.endswith(".gif"):
            mime_type = "image/gif"
        # Add other formats if necessary

        # Create the data URL
        data_url = f"data:{mime_type};base64,{base64_encoded}"

        return data_url

def preprocess_img(img, input_size=(1024, 1024), device='cpu', bgr2rgb=True, half=False, to_tensor=True):
    if bgr2rgb:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_in, ratio, (dw, dh) = letterbox(img, new_shape=input_size, auto=False, stride=64)
    if to_tensor:
        img_in = img_in.transpose((2, 0, 1))[::-1]  # HWC to CHW, BGR to RGB
        img_in = np.array([np.ascontiguousarray(img_in)]).astype(np.float32) / 255
        if to_tensor:
            img_in = torch.from_numpy(img_in).to(device)
            if half:
                img_in = img_in.half()
    return img_in, ratio, int(dw), int(dh)

def postprocess_mask(img: Union[torch.Tensor, np.ndarray], thresh=None):
    # img = img.permute(1, 2, 0)
    if isinstance(img, torch.Tensor):
        img = img.squeeze_()
        if img.device != 'cpu':
            img = img.detach_().cpu()
        img = img.numpy()
    else:
        img = img.squeeze()
    if thresh is not None:
        img = img > thresh
    img = img * 255
    # if isinstance(img, torch.Tensor):

    return img.astype(np.uint8)

def postprocess_yolo(det, conf_thresh, nms_thresh, resize_ratio, sort_func=None):
    det = non_max_suppression(det, conf_thresh, nms_thresh)[0]
    # bbox = det[..., 0:4]
    if det.device != 'cpu':
        det = det.detach_().cpu().numpy()
    det[..., [0, 2]] = det[..., [0, 2]] * resize_ratio[0]
    det[..., [1, 3]] = det[..., [1, 3]] * resize_ratio[1]
    if sort_func is not None:
        det = sort_func(det)

    blines = det[..., 0:4].astype(np.int32)
    confs = np.round(det[..., 4], 3)
    cls = det[..., 5].astype(np.int32)
    return blines, cls, confs

class TextDetector:
    lang_list = ['eng', 'ja', 'unknown']
    langcls2idx = {'eng': 0, 'ja': 1, 'unknown': 2}

    def __init__(self, model_path, input_size=1024, device='cpu', half=False, nms_thresh=0.35, conf_thresh=0.4, mask_thresh=0.3, act='leaky'):
        super(TextDetector, self).__init__()
        cuda = device == 'cuda'

        if Path(model_path).suffix == '.onnx':
            self.model = cv2.dnn.readNetFromONNX(model_path)
            self.net = TextDetBaseDNN(input_size, model_path)
            self.backend = 'opencv'
        else:
            self.net = TextDetBase(model_path, device=device, act=act)
            self.backend = 'torch'
        
        if isinstance(input_size, int):
            input_size = (input_size, input_size)
        self.input_size = input_size
        self.device = device
        self.half = half
        self.conf_thresh = conf_thresh
        self.nms_thresh = nms_thresh
        self.seg_rep = SegDetectorRepresenter(thresh=0.3)

    @torch.no_grad()
    def __call__(self, img, refine_mode=REFINEMASK_INPAINT, keep_undetected_mask=False):
        img_in, ratio, dw, dh = preprocess_img(img, input_size=self.input_size, device=self.device, half=self.half, to_tensor=self.backend=='torch')
        im_h, im_w = img.shape[:2]

        blks, mask, lines_map = self.net(img_in)

        resize_ratio = (im_w / (self.input_size[0] - dw), im_h / (self.input_size[1] - dh))
        blks = postprocess_yolo(blks, self.conf_thresh, self.nms_thresh, resize_ratio)

        if self.backend == 'opencv':
            if mask.shape[1] == 2:     # some version of opencv spit out reversed result
                tmp = mask
                mask = lines_map
                lines_map = tmp
        mask = postprocess_mask(mask)

        lines, scores = self.seg_rep(self.input_size, lines_map)
        box_thresh = 0.6
        idx = np.where(scores[0] > box_thresh)
        lines, scores = lines[0][idx], scores[0][idx]
        
        # map output to input img
        mask = mask[: mask.shape[0]-dh, : mask.shape[1]-dw]
        mask = cv2.resize(mask, (im_w, im_h), interpolation=cv2.INTER_LINEAR)
        if lines.size == 0 :
            lines = []
        else :
            lines = lines.astype(np.float64)
            lines[..., 0] *= resize_ratio[0]
            lines[..., 1] *= resize_ratio[1]
            lines = lines.astype(np.int32)
        blk_list = group_output(blks, lines, im_w, im_h, mask)

        return blk_list

def model2annotations(model_path, image_data_url, save_json=False):
    device = 'cpu'
    model = TextDetector(model_path=model_path, input_size=1024, device=device, act='leaky')  

    image = Image.open(io.BytesIO(base64.b64decode(image_data_url.split(',')[1])))
    img = np.array(image)
    im_h, im_w = img.shape[:2]
    blk_list = model(img, refine_mode=REFINEMASK_ANNOTATION, keep_undetected_mask=True)
    polys = []
    blk_xyxy = []
    for blk in blk_list:
        polys += blk.lines
        blk_xyxy.append(blk.xyxy)
    blk_xyxy = xyxy2yolo(blk_xyxy, im_w, im_h)
    
    print(blk_xyxy)

    return blk_xyxy
