   curl -X POST https://polished-marmot-96.convex.site/webhooks/indiamart \
     -H "Content-Type: application/json" \
     -d '{
       "CODE": 200,
       "STATUS": "SUCCESS",
       "RESPONSE": {
         "UNIQUE_QUERY_ID": "test123",
         "SENDER_NAME": "Test User",
         "SUBJECT": "Test Inquiry",
         "SENDER_MOBILE": "9876543210",
         "SENDER_EMAIL": "test@example.com",
         "QUERY_MESSAGE": "Test message",
         "QUERY_TIME": "2024-01-01 12:00:00",
         "QUERY_TYPE": "B",
         "QUERY_MCAT_NAME": "Test Category",
         "QUERY_PRODUCT_NAME": "Test Product",
         "SENDER_COUNTRY_ISO": "IN"
       }
     }'
   