School - Budget Management System (Appscript)

Files:
- Code.gs       : server-side Google Apps Script
- Index.html    : dashboard / forms / tables / charts
- Database.xlsx : google sheet as storage

Canonical schema:
Projects:
  project_id, title, amount_goal, date_created, created_by, date_updated, updated_by

Categories:
  project_id, category_id, title, description, flow_type,
  date_created, created_by, date_updated, updated_by

Income / Expenses:
  transaction_id, category_id, date, amount, remarks,
  date_created, created_by, date_updated, updated_by

Important behavior:
- Transaction form does NOT ask Income/Expense.
- User selects Project then Category.
- Category.flow_type decides whether the record is saved to Income or Expenses.
- Transactions derive Project through Category, so project_id is not duplicated in
  Income/Expenses.
- Editing a transaction and switching to a category with the opposite flow type
  moves the row to the correct sheet while retaining creation audit data.
- A category's Project/Flow Type cannot be changed after it has transactions.
