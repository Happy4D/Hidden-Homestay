#!/usr/bin/env python3
"""Apply the owner's 21 Khmer copy corrections to dev/app.js."""
a = open('dev/app.js').read()
log = []

def rep(old, new, label):
    global a
    if old == new:
        log.append(('SKIP (already exact)', label)); return
    assert old in a, 'MISSING ANCHOR: ' + label
    a = a.replace(old, new, 1)
    log.append(('OK', label))

# 1a. hero title — remove final khan
rep("heroTitle: 'បន្ទប់ដែលអ្នកចូលចិត្តបំផុត កំពុងរង់ចាំអ្នក។',",
    "heroTitle: 'បន្ទប់ដែលអ្នកចូលចិត្តបំផុត កំពុងរង់ចាំអ្នក',", '1a hero title (remove ។)')
# 1b. hero sub — shorten second sentence
rep("ជ្រើសរើសកាលបរិច្ឆេទ ជ្រើសបន្ទប់ ហើយទទួលបានការបញ្ជាក់ និងមគ្គុទ្ទេសក៍ចូល តាម Telegram របស់អ្នក។",
    "ជ្រើសរើសកាលបរិច្ឆេទ បន្ទប់ ហើយទទួលបានការបញ្ជាក់ និងចូល តាម Telegram របស់អ្នក។", '1b hero sub')
# 2. hero fact 2
rep("heroFact2: 'ការបញ្ជាក់ និងមគ្គុទ្ទេសក៍ចូល ភ្លាមៗតាម Telegram',",
    "heroFact2: 'ការបញ្ជាក់ និងចូលភ្លាមៗតាម Telegram',", '2 hero fact2')
# 3. rooms title
rep("roomsTitle: 'បន្ទប់ ១២ បន្ទប់ · អត្តសញ្ញាណ ១២ យ៉ាង',",
    "roomsTitle: 'បន្ទប់ ១២ បន្ទប់ · ជាមួយនឹងស្ទីលទាំង១២ ខុសៗគ្នា',", '3 rooms title')
# 4. rooms sub
rep("roomsSub: 'ផ្ទះសំណាក់មួយ បន្ទប់ចម្រុះ ១២ បន្ទប់ — ស្អាត ឯកជន និងរួចរាល់សម្រាប់ការសម្រាករបស់អ្នក។ ទាំងអស់ស្ថិតនៅបូរីវៀនភ្នំពេញ។',",
    "roomsSub: 'ផ្ទះមួយ បន្ទប់ចម្រុះ ១២ បន្ទប់ — ស្អាត ឯកជនភាពមាននៅបូរីវៀនភ្នំពេញ។',", '4 rooms sub')
# 5. pool name + blurb
rep("nameKh: 'បន្ទប់ប៉ុល',", "nameKh: 'បន្ទប់Pool',", '5a pool name -> បន្ទប់Pool')
rep("blurbKh: 'តុប៉ុល ៨បាល់ឯកជនរបស់អ្នក — រៀបចំបាល់ បាញ់ និងរីករាយជាមួយហ្គេម នៅក្នុងបន្ទប់ផ្ទាល់ខ្លួន។'",
    "blurbKh: '8Ball — Dart និងរីករាយជាមួយហ្គេម នៅក្នុងបន្ទប់ផ្ទាល់ខ្លួន។'", '5b pool blurb (8Ball — Dart)')
# 6. pool tags
rep("tagsKh: ['តុប៉ុល ៨បាល់', 'ការលេងឯកជន', 'កៅអីស្រស់ស្រាយ']",
    "tagsKh: ['8 Ball', 'ឯកជនភាព', 'Dart']", '6 pool tags')
# 7. vintage tags
rep("tagsKh: ['ការតុបតែងបែបរេត្រូ', 'មុំអានសៀវភៅ', 'ម៉ាស៊ីនចាក់តន្ត្រី']",
    "tagsKh: ['ការតុបតែងបែបបុរាណ', 'អានសៀវភៅ', 'ម៉ាស៊ីនចាក់តន្ត្រី']", '7 vintage tags')
# 8. shanghai blurb + drop tea-set tag (both languages)
rep("blurbKh: 'ពន្លឺចង្កៀង និងរចនាបថបែបបូព៌ន — កំណាត់តូចនៃសាំងហៃចាស់ៗ នៅខាងក្នុងភ្នំពេញ។'",
    "blurbKh: 'ពន្លឺចង្កៀង និងរចនាបថបែបបូព៌ន។'", '8a shanghai blurb')
rep("tags: ['Oriental Décor', 'Warm Lighting', 'Tea Set'],",
    "tags: ['Oriental Décor', 'Warm Lighting'],", '8b shanghai EN tags (drop Tea Set)')
rep("tagsKh: ['ការតុបតែងបែបបូព៌ន', 'ពន្លឺភ្លឺទន់', 'សេន្តោទឹកតែ']",
    "tagsKh: ['ការតុបតែងបែបបូព៌ន', 'ពន្លឺភ្លឺទន់']", '8c shanghai KH tags (drop tea set)')
# 9. classic blurb
rep("blurbKh: 'គ្មានពេលវេលាបញ្ចប់ ស្អាតស្ថិត និងរស់រវើកដោយស្ងប់ស្ងៀម។ បន្ទប់ដែលមិនដែលលែងនិយម។'",
    "blurbKh: 'សាមញ្ញ ស្អាតនិងជាបន្ទប់ដែលមានទាក់ទាញ។'", '9 classic blurb')
# 10. london — remove Smart TV from both languages + new blurb
rep("tags: ['British Theme', 'Cosy Chairs', 'Smart TV'],",
    "tags: ['British Theme', 'Cosy Chairs'],", '10a london EN tags (drop Smart TV)')
rep("tagsKh: ['រចនាបថអង់គ្លេស', 'កៅអីទន់ៗ', 'Smart TV']",
    "tagsKh: ['រចនាបថអង់គ្លេស', 'កៅអីទន់ៗ']", '10b london KH tags (drop Smart TV)')
rep("blurbKh: 'ក្រឡាផ្ទៃការ៉េខ្មៅស ពណ៌ក្រហមប្រអប់សំបុត្រ និងអារម្មណ៍អង់គ្លេសក្តៅក្រហាយ — វេលាទទួលទានតែ! មិនមែនទេ?​'",
    "blurbKh: 'ពណ៌ក្រហមដ៏លេចធ្លោ និងបរិយាកាសបែបអង់គ្លេសដ៏កក់ក្ដៅ — ចង់អង្គុយផឹកតែជាមួយយើងទេ?'", '10c london blurb')
# 11. burger tag
rep("tagsKh: ['ការតុបតែងសប្បាយៗ', 'Smart TV', 'អូឌីយ៉ូ Bluetooth']",
    "tagsKh: ['ការតុបតែង', 'Smart TV', 'អូឌីយ៉ូ Bluetooth']", '11 burger tag')
# 12. kuromi tag
rep("tagsKh: ['រចនាបថកូរ៉ូមី', 'ពូកទន់ៗ', 'មុំថតរូប']",
    "tagsKh: ['រចនាបថកូរ៉ូមី', 'ពូកទន់', 'មុំថតរូប']", '12 kuromi tag')
# 13. VIP includes noodles
rep("kh: ['គ្រែ VIP', 'សូហ្វា', 'ម៉ាស៊ីនក្តៅទឹក', 'ម៉ាស៊ីនសម្ងួតសក់', 'មីកែវ ២']",
    "kh: ['គ្រែ VIP', 'សូហ្វា', 'ម៉ាស៊ីនក្តៅទឹក', 'ម៉ាស៊ីនសម្ងួតសក់', 'មី២កំប៉ុង']", '13 VIP noodles')
# 14. how1P + weekday label (same misspelled word)
rep("តម្លៃបង្ហាញភ្លាមៗ ថ្ងៃធ្នើរ ឬចុងសប្តាហ៍។", "តម្លៃបង្ហាញភ្លាមៗ ថ្ងៃធ្វើការ ឬចុងសប្តាហ៍។", '14a how1P ធ្នើរ->ធ្វើការ')
rep("weekday: 'ថ្ងៃធ្នើរ', weekend: 'ចុងសប្តាហ៍'", "weekday: 'ថ្ងៃធ្វើការ', weekend: 'ចុងសប្តាហ៍'", '14b weekday label (same word)')
# 15. how3P — user's before == after; verify current text stays
rep("how3P: 'យល់ព្រមនឹងច្បាប់ផ្ទះ បញ្ជាក់ការកក់របស់អ្នក ហើយទទួលបានការបញ្ជាក់ រូបបន្ទប់ មគ្គុទ្ទេសក៍ចូល និងមគ្គុទ្ទេសក៍ចត់ឡាន តាម Telegram ដោយផ្ទាល់។',",
    "how3P: 'យល់ព្រមនឹងច្បាប់ផ្ទះ បញ្ជាក់ការកក់របស់អ្នក ហើយទទួលបានការបញ្ជាក់ រូបបន្ទប់ មគ្គុទ្ទេសក៍ចូល និងមគ្គុទ្ទេសក៍ចត់ឡាន តាម Telegram ដោយផ្ទាល់។',", '15 how3P (no change requested)')
# 16. camping blurb
rep("blurbKh: 'ជំរុំក្នុងផ្ទះពេញដោយផ្កាយ — អារម្មណ៍តែន ពន្លឺតូចៗ និងក្តីសុបិន្តផ្អែមល្ហុង ដោយគ្មានយ៉ាងគីសចូលមក។'",
    "blurbKh: 'បរិយាកាសដូចជាកំពុងបោះតង់ក្រោមមេឃពោរពេញដោយផ្កាយ — តង់តូចៗ ភ្លើងតុបតែងភ្លឺស្រទន់។'", '16 camping blurb')
# 17. fishing blurb
rep("blurbKh: 'ត្រជាក់ជាប់បាត និងស្ងប់ស្ងៀមយ៉ាងចម្លែក។ កន្លែងគេចវេញបែបក្រោមទឹក ក្នុងពណ៌ខៀវទន់ៗ។'",
    "blurbKh: 'សាមញ្ញ តែមានស្ទីល និងផ្តល់អារម្មណ៍ស្ងប់ស្ងាត់ប្លែកៗ។ បន្ទប់បែបពិភពក្រោមសមុទ្រ ជាមួយពណ៌ខៀវស្រទន់ដែលធ្វើឱ្យមានអារម្មណ៍ស្រស់ស្រាយ។'", '17 fishing blurb')
# 18. kuromi blurb — user's before == after; keep
rep("blurbKh: 'កូរ៉ូមី ក្រុមបេឡែតតូចរបស់ Sanrio — ពណ៌ខ្មៅ ផ្កាឈូក និងគួរឱ្យស្រលាញ់ខ្លាំងពុំអាចទប់ទេ។'",
    "blurbKh: 'កូរ៉ូមី ក្រុមបេឡែតតូចរបស់ Sanrio — ពណ៌ខ្មៅ ផ្កាឈូក និងគួរឱ្យស្រលាញ់ខ្លាំងពុំអាចទប់ទេ។'", '18 kuromi blurb (no change requested)')
# 19. veggie blurb
rep("blurbKh: 'បៃតងស្រស់ និងស្ងប់នៃសួនច្បារ — ដង្ហើមបរិសុទ្ធបែប VIP ជាមួយគ្រប់យ៉ាងត្រូវបានធ្វើឱ្យប្រសើរឡើង។'",
    "blurbKh: 'ពណ៌បៃតងស្រស់ស្អាត និងបរិយាកាសស្ងប់ស្ងាត់ដូចសួនច្បារ — បន្ទប់ VIP សម្រាប់អ្នកដែលចង់សម្រាកក្នុងបរិយាកាសស្រស់ស្រាយ និងទទួលបានភាពពិសេសជាងមុន។'", '19 veggie blurb')
# 20. slayer blurb
rep("blurbKh: 'ងងឹត គួរឱ្យចាប់អារម្មណ៍ និងរស់រវើកខ្លាំង សម្រាប់អ្នកដែលចូលចិត្តភាពស្រង់ស្រីជាមួយទម្រង់ពិសេស។'",
    "blurbKh: 'បែបងងឹត មានភាពទាក់ទាញ និងរចនាយ៉ាងលេចធ្លោ — ស័ក្តិសមសម្រាប់អ្នកដែលចូលចិត្តភាពកក់ក្ដៅ ប៉ុន្តែចង់បានស្ទីលដ៏មានភាពខុសប្លែក។'", '20 slayer blurb')
# 21. chip type label for pool follows new room name
rep("? (r.type === 'vip' ? 'បន្ទប់ VIP' : (r.type === 'pool' ? 'បន្ទប់ប៉ុល' : 'បន្ទប់ស្តង់ដារ'))",
    "? (r.type === 'vip' ? 'បន្ទប់ VIP' : (r.type === 'pool' ? 'បន្ទប់Pool' : 'បន្ទប់ស្តង់ដារ'))", '21 chip label pool')

open('dev/app.js', 'w').write(a)
for status, label in log:
    print(f'{status:26s} {label}')
print('---')
print('DONE' if all(s == 'OK' or s.startswith('SKIP') for s, _ in log) else 'CHECK LOG')
