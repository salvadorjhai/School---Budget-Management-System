# \# School - Budget Management System (Appscript)

# not another budget management system . ;p

# 

# \## Files:

# \- Code.gs       : server-side Google Apps Script

# \- Index.html    : dashboard / forms / tables / charts

# \- Database.xlsx : google sheet as storage

# 

# \## Code.gs configuration

# create ng new google sheet, import nyo `Database.xlsx` . kunin nyo yung spreadsheet id .

# ```

# /\*\*

# &#x20;\* https://docs.google.com/spreadsheets/d/THIS\_IS\_YOUR\_SPREADSHEET\_ID/

# &#x20;\*/

# const APP\_CONFIG = {

# &#x20; spreadsheetId: 'PASTE\_YOUR\_SHEET\_HERE',

# &#x20; sheets: {

# &#x20;   projects: 'Projects',

# &#x20;   categories: 'Categories',

# &#x20;   expenses: 'Expenses',

# &#x20;   income: 'Income',

# &#x20;   authorizedUsers: 'AuthorizedUsers'

# &#x20; },

# &#x20; auditFields: \['date\_created', 'created\_by', 'date\_updated', 'updated\_by']

# };

# ```

# 

# \## Canonical Schema

# 

# \- \*\*Projects:\*\* `project\_id` | `title` | `amount\_goal` | `date\_created` | `created\_by` | `date\_updated` | `updated\_by`

# \- \*\*Categories:\*\* `project\_id` | `category\_id` | `title` | `description` | `flow\_type` | `date\_created` | `created\_by` | `date\_updated` | `updated\_by`

# \- \*\*Income / Expenses:\*\* `transaction\_id` | `category\_id` | `date` | `amount` | `remarks` | `date\_created` | `created\_by` | `date\_updated` | `updated\_by`

# 

# \# Important behavior:

# \- Transaction form does NOT ask Income/Expense.

# \- User selects Project then Category.

# \- Category.flow\_type decides whether the record is saved to Income or Expenses.

# \- Transactions derive Project through Category, so project\_id is not duplicated in

# &#x20; Income/Expenses.

# \- Editing a transaction and switching to a category with the opposite flow type

# &#x20; moves the row to the correct sheet while retaining creation audit data.

# \- A category's Project/Flow Type cannot be changed after it has transactions.

# 

# 

# \# FAQ

# 

# <details>

# <summary><b>Is it free?</b></summary>

# <br>

# yes, except nalang kung gusto mo ko bigyan ng kash

# </details>

# 

# <details>

# <summary><b>pwede patulong ?</b></summary>

# <br>

# pwede basta bigyan mo ko ng kash ;p

# </details>

# 

# <details>

# <summary><b>single user?</b></summary>

# <br>

# yes, single for private access and use .

# </details>

# 

# <details>

# <summary><b>pwede multi user ?</b></summary>

# <br>

# pwede pero need mo ishare yung google sheet ; publicly or by selected google users .

# </details>

# 

# 

