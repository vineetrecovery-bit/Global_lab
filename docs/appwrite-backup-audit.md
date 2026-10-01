# Certification Data Review Items

These items can be reviewed by the certification team after MySQL/R2 migration.

## 1. Same Image Used For Two Certificate Numbers

The same certificate image/file is linked to two different certificate numbers. This is accepted for migration because both certificates will remain separate database rows with different primary keys. The certification team can correct either image after migration through the admin/runtime workflow.

| Image/File ID | Certificate Numbers |
| - | - |
| 6a761dbf00024e3205e4 | AR-SLW-0013-009, AR-SLW-0013-010 |

## 2. Unused Storage Files To Review

These files exist in storage but are not linked to any current certificate record after duplicate cleanup. The straight byte-identical duplicate files have already been removed from the local migration backup. The files below are different from the currently linked image for the same certificate number, or do not map clearly to a current certificate.

| File ID | Original File Name |
| - | - |
| 6a7ec9b6002a1df206ab | _DV PRO global Lab.jpg |
| 6aabbe49000d4df09ff9 | 175289.jpg |
| 6a96624a003273e5e2c9 | 6.jpg |
| 6a682ede000ea944d881 | AR-DVP-0012-070.jpg |
| 6a682ede000ea497c938 | AR-DVP-0012-071.jpg |
| 6a682ede000eadff3fbd | AR-DVP-0012-072.jpg |
| 6a682ede000ea7e3cad9 | AR-DVP-0012-073.jpg |
| 6a5f650f003019906897 | AR-IN-0012-045.jpg |
| 6a761dbf000242f06f78 | AR-SLW-0013-010.jpg |
