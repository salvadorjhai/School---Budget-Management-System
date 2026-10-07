Bularit ES Budget Tracker - Fixed Apps Script

Files:
- Code.gs       : server-side Google Apps Script
- Index.html    : dashboard / forms / tables / charts
- Bularit_ES_BudgetTracker_fixed.xlsx : corrected sheet schema reference

Recommended deployment steps:
1. Back up the current Google Sheet.
2. Replace your Apps Script Code.gs and Index.html with the supplied files.
3. In Apps Script, run setupBudgetTracker() once manually and authorize it.
   - This is non-destructive for existing data.
   - It renames known legacy headers (beginning_balance -> amount_goal,
     name -> title, inflow -> flow_type).
   - It appends missing required columns, including transaction_id.
4. Review Categories and make sure every category has a valid Project and
   Flow Type (Income or Expense).
5. Deploy/redeploy the Web App.

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
