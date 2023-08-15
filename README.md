
# Veebee Browser Extension

Uses Google Vision, DeepL, GPT, and [manga-ocr](https://github.com/kha-white/manga-ocr) to help you with translating and/or learning new languages while browing the internet in a Chrome Browser. One great use case is for reading manga but you can use it on most content on the web.

![](assets/example.png)

**Install: [Chrome](https://chrome.google.com/webstore/detail/manga-reader/eabnmbpmoencafnpbobahdeamaljhoef)**

Note that the extension won't work on certain origins, such as:

- chrome origins like: `chrome://` and `chrome-extension://`
- the official chrome web store: `https://chrome.google.com/webstore/category/extensions`

## Build Extension Locally

1. Fill in the `.env_template` and rename it to `.env`
2. Execute `npm run start`
3. Navigate to `chrome://extensions`
4. Make sure that the `Developer mode` switch is enabled
5. Click on the `Load unpacked` button and select the `dist` directory

## Build Backend Locally

1. Fill in the `server/.env_template` and rename it to `server/.env`
2. Set up GCP project (Optional if you comment out the GCP related stuff)
3. Create your `server/firebaseServiceAccountKey.json` (Optional if you comment out the authentication stuff)
4. Set up Firestore (Optional if you comment out the Firestore related code)
5. `pip install -r requirements.txt`
6. `python3 main.py`

# Contact

Please send any feedback or inquiries to lyrian1029@gmail.com

This is an early Proof of Concept. If users like it, I am willing to invest more time to add various features, such as translating an entire page at a time, adding side panel to allow more space for translation details, and chat mode with GPT. Another obvious one is to add more languages. Any other feedback is very welcome!


# Acknowledgments

Learned a lot about Chrome extensions from
https://github.com/RasikaWarade/chrome-extension-mv3-firebase-boilerplate
https://github.com/simov/screenshot-capture

# License

The MIT License (MIT)

Copyright (c) 2023-present Ian Lee <lyrian1029@gmail.com> (https://github.com/ianbbqzy/veebee)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

