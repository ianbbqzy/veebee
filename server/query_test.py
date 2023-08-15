
import pinecone
from llama_index import VectorStoreIndex
from llama_index.vector_stores import PineconeVectorStore
from dotenv import load_dotenv
import os
import openai
import pinecone
from llama_index.query_engine import RetrieverQueryEngine
from main import call_gpt
load_dotenv()
openai.api_key = os.environ["OPENAI_API_KEY"]
pinecone.init(api_key=os.environ["PINECONE_KEY"], environment="asia-southeast1-gcp-free")

# vector_store = PineconeVectorStore(pinecone.Index("manga-reader"))
# index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
# retriever = index.as_retriever(similarity_top_k=5, search_type="mmr")
# documents = retriever.retrieve("茶ひげ海賊団")
# # print([doc.node.text for doc in documents])
# stuff_docs = [doc.node.text + "\n" for doc in documents]
# print(stuff_docs)
# query_engine = RetrieverQueryEngine.from_args(retriever=index.as_retriever(similarity_top_k=0), response_mode="compact")

# messages=[
#             {"role": "user", "content": f"""
# You are a robotic translator who has mastered all languages. You provide the translation and breakdown
# of the phrase or a word directly without trying to engage in a conversation. When given a phrase or word to be
# translated, you first provide the orignal phrase or word to be translated, followed by the direc translation in English
# and only the direct translation,
# followed by the breakdown of the phrase into compound words or loan words if necessary and explain their definitions.

# Use the attached context to first check if the phrase contains a name or a place from a fictional universe. If so, point
# out that the phrase to be translated has a name or a place.
# context:
# {stuff_docs}

# To be translated: 茶ひげーお前ら捕まっちつかまうのかまえ
# Translation:
# """}
#         ]

# print(call_gpt(messages)["content"])



# ####### check if a sentence contains a name or place #######


# messages=[
#             {"role": "user", "content": f"""
# You are a robotic translator who has mastered all languages. You provide the translation and breakdown
# of the phrase or a word directly without trying to engage in a conversation. Sometimes, sentences or phrases to be
# translated might contains a name or a place from a fictional universe. You first check if the phrase might
# contain a name or a place from a fictional universe. Say yes or no.
             
# For example, "茶ひげ" in "茶ひげーお前ら捕まっちつかまうのかまえ" could be a name.          

# To be translated: "好きな食べ物はアーモンド"
# Yes or no:"""}
#         ]
# print(call_gpt(messages)["content"])



####### check if a phrase is broken up or contains extra characters #######
# Always returns valid currently

# messages=[
#             {"role": "user", "content": f"""
# You are a robotic translator who has mastered all languages. You provide the translation and breakdown
# of the phrase or a word directly without trying to engage in a conversation. Sometimes, sentences or phrases
# that users provide might have omitted trailing or preceding characters. You first check if the phrase might
# be problematic. Say "incomplete", "extra", or "valid".
             
# For example, in the case where "茶ひげーお前ら捕まっちつかまうのかまえ" is to be translated
# user might have only provided "茶ひげーお前ら捕まっちつかまうのか" due to a mistake. Say "incomplete" in this case.

# in the case where "研究所までの運搬役" is to be translated
# user might have only provided 研究所までの運搬役にさ" due to a mistake. Say "extra" in this case.          

# To be translated: 僻地に存
# validity check:"""}
#         ]
# print(call_gpt(messages)["content"])

###### check if a phrase is broken up or contains extra characters #######

messages=[
            {"role": "user", "content": f"""
You are a robotic translator who is great at translating Japanese to any other languages. Sometimes, users
copy a Japnaese phrase from an image using OCR, but the Japanese text might have furigana annotations.
Your task is to identify furigana and remove it from the text provided by the human. 
             
For example, in the case where "スモーカー先生!!!" is to be translated
user might have only provided "スモーカー先生!!!せんせいえ". Say "スモーカー先生!!!" in this case.

To be translated: 僻地に存
validity check:"""}
        ]
print(call_gpt(messages)["content"])


############# langchain stuff ################

# from langchain.vectorstores import Pinecone
# from langchain.embeddings.openai import OpenAIEmbeddings
# from langchain.chat_models import ChatOpenAI
# from langchain.chains import RetrievalQA
# from langchain.prompts import PromptTemplate
# embeddings = OpenAIEmbeddings()

# docsearch = Pinecone.from_existing_index("manga-reader", embedding=embeddings)
# retriever = docsearch.as_retriever(search_type="similarity", k=5) # or mmr
# can also use docsearch.similarity_search_with_score() to directly get the documents
# retriever.search_kwargs["k"] = 5
# print(docsearch.similarity_search_with_score("茶ひげーお前ら捕まっちつかまうのかまえ"))

# template = """
# You are a robotic translator who has mastered all languages. You provide the translation and breakdown
# of the phrase or a word directly without trying to engage in a conversation. When given a phrase or word to be
# translated, you first provide the orignal phrase or word to be translated, followed by the direc translation in English
# and only the direct translation,
# followed by the breakdown of the phrase into compound words or loan words if necessary and explain their definitions.

# You may use the attached context, in case the phrase contains a name or a place from a fictional universe.
# context:
# {context}

# To be translated: {question}
# Translation:"""
# PROMPT = PromptTemplate(input_variables=["context", "question"], template=template)
# model = ChatOpenAI(model="gpt-3.5-turbo")
# qa = RetrievalQA.from_chain_type(
#     llm=model, chain_type="stuff", 
#     retriever=retriever,
#     chain_type_kwargs={"prompt": PROMPT}, 
#     verbose=True)

# output = qa({"query": "茶ひげーお前ら捕まっちつかまうのかまえ"})
# print(output)