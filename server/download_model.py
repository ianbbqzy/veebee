from transformers import AutoFeatureExtractor, AutoTokenizer, VisionEncoderDecoderModel

pretrained_model_name_or_path='kha-white/manga-ocr-base'

# Download components
feature_extractor = AutoFeatureExtractor.from_pretrained(pretrained_model_name_or_path)
tokenizer = AutoTokenizer.from_pretrained(pretrained_model_name_or_path)
model = VisionEncoderDecoderModel.from_pretrained(pretrained_model_name_or_path)

# Save components to local directory
save_directory = "./model"
feature_extractor.save_pretrained(save_directory)
tokenizer.save_pretrained(save_directory)
model.save_pretrained(save_directory)