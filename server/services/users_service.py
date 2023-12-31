import datetime
from google.cloud import firestore

class UsersService:

    def __init__(self, hard_limit):
        self.db = firestore.Client()
        self.hard_limit = hard_limit

    # Function to increment request count for a user
    def increment_request_count(self, user_id, increase_by=1):
        # Get current month and year
        current_month = datetime.datetime.now().strftime("%Y-%m")
        
        # Define the document path for the user's request count
        doc_path = f"users/{user_id}/monthlyCounts/{current_month}"
        
        # Increment the request count document
        doc_ref = self.db.document(doc_path)
        doc_ref.set({"count": firestore.Increment(increase_by)}, merge=True)

    # Function to store request data in Firestore
    def store_request_data(self, user_id, text, translation, type, api):
        # Define the Firestore collection and document paths
        collection_path = f"users/{user_id}/requests"
        document_path = self.db.collection(collection_path).document()

        # Create a new document with autogenerated ID
        request_doc_ref = self.db.document(document_path.path)
        request_data = {
            "text": text,
            "type": type,
            "api": api,
            "response": translation
        }
        # Store the request data in the document
        request_doc_ref.set(request_data)

    # Function to retrieve request count for a user
    def get_request_count(self, user_id):
        current_month = datetime.datetime.now().strftime("%Y-%m")
        doc_path = f"users/{user_id}/monthlyCounts/{current_month}"
        doc_ref = self.db.document(doc_path)
        doc_snapshot = doc_ref.get()

        custom_limit = self.get_custom_limit(user_id)
        limit = custom_limit if custom_limit is not None else self.hard_limit

        if doc_snapshot.exists:
            request_count = doc_snapshot.get("count")
            return request_count, limit
        else:
            return 0, limit

    def get_custom_limit(self, user_id):
        current_month = datetime.datetime.now().strftime("%Y-%m")
        doc_path = f"users/{user_id}/customLimit/{current_month}"
        doc_ref = self.db.document(doc_path)
        doc_snapshot = doc_ref.get()

        if doc_snapshot.exists:
            custom_limit = doc_snapshot.get("limit")
            return custom_limit
        else:
            return None