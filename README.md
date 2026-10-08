
# School - Budget Management System (Appscript)
not another budget management system . ;p

# Disclaimer
Under the Department of Education guidelines—most recently reiterated through DepEd Memorandum No. 41, s. 2024 and DepEd Order No. 19, s. 2008—the agency strictly prohibits collecting any fees or contributions from students and teachers during enrollment and throughout the school year.

## Files:
- Code.gs       : server-side Google Apps Script
- Index.html    : dashboard / forms / tables / charts
- Database.xlsx : google sheet as storage

## Code.gs configuration
create ng new google sheet, import nyo `Database.xlsx` . kunin nyo yung spreadsheet id .
```
/**
 * https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SPREADSHEET_ID/
 */
const APP_CONFIG = {
  spreadsheetId: 'PASTE_YOUR_SHEET_HERE',
  sheets: {
    projects: 'Projects',
    categories: 'Categories',
    expenses: 'Expenses',
    income: 'Income',
    authorizedUsers: 'AuthorizedUsers'
  },
  auditFields: ['date_created', 'created_by', 'date_updated', 'updated_by']
};
```

## Canonical Schema

- **Projects:** `project_id` | `title` | `amount_goal` | `date_created` | `created_by` | `date_updated` | `updated_by`
- **Categories:** `project_id` | `category_id` | `title` | `description` | `flow_type` | `date_created` | `created_by` | `date_updated` | `updated_by`
- **Income / Expenses:** `transaction_id` | `category_id` | `date` | `amount` | `remarks` | `date_created` | `created_by` | `date_updated` | `updated_by`

# Important behavior:
- Transaction form does NOT ask Income/Expense.
- User selects Project then Category.
- Category.flow_type decides whether the record is saved to Income or Expenses.
- Transactions derive Project through Category, so project_id is not duplicated in
  Income/Expenses.
- Editing a transaction and switching to a category with the opposite flow type
  moves the row to the correct sheet while retaining creation audit data.
- A category's Project/Flow Type cannot be changed after it has transactions.


# FAQ

<details>
<summary><b>Is it free?</b></summary>
<br>
yes, except nalang kung gusto mo ko bigyan ng kash
</details>

<details>
<summary><b>pwede patulong ?</b></summary>
<br>
pwede basta bigyan mo ko ng kash ;p
</details>

<details>
<summary><b>single user?</b></summary>
<br>
yes, single for private access and use .
</details>

<details>
<summary><b>pwede multi user ?</b></summary>
<br>
pwede pero need mo ishare yung google sheet ; publicly or by selected google users .
</details>

![mobile layout](https://github.com/salvadorjhai/School---Budget-Management-System/blob/main/res/1.png?raw=true) ![mobile layout](https://github.com/salvadorjhai/School---Budget-Management-System/blob/main/res/2.png?raw=true) 
![mobile layout](https://github.com/salvadorjhai/School---Budget-Management-System/blob/main/res/3.png?raw=true)

