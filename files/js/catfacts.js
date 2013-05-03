var CatFacts = function() {};
(function(){
var lastCatFact;

var interestingFacts = [
'Cats and humans have identical regions in the brain responsible for emotion.',
'A cat\'s brain is more similar to a human brain than that of a dog.',
'Cats can rotate each ear independently from the other in 180 degrees.',
'Cat hearing stops at 65kHz; human hearing stops at 20kHz.',
'Cats see about 6 times better than humans at night.',
'Cats can judge within 3 inches the precise location of a sound being made 1 yard away.',
'Cats can be right-pawed or left-pawed.',
'Cats cannot see directly under their nose.',
'Cats express their present state of mind through their tail.',
'Cats are the only animals that walk on their toes.',
'Cats were worshipped as holy in Ancient Egypt and granted great respect in every household.',
'Phoenician ships likely brought the first domesticated cats to Europe in about 900 BC.',
'Ancient Egyptians shaved their eyebrows in mourning when the family cat died.',
'In Siam, a cat rode in a chariot at the head of a parade celebrating the new king.',
'Most cats adore sardines.',
'Cats use their whiskers to measure distances and changes in air pressure.',
'Cat whiskers are very sensitive to touch.',
'Abraham Lincoln kept four cats at the White House during his presidency.',
'Cats purr at the same frequency as an idling diesel engine.',
'Nikola Tesla was inspired to study electricity after his cat static-shocked him in his youth.',
'Isaac Newton invented the cat-flap.',
'Cats use their tails for balance and have nearly 30 individual bones in them.',
'Even though Napoleon was known as a ruthless conqueror, he was always very afraid of cats.',
'A kitten\'s eyes are always blue at first.',
'A cat can jump as high as seven times as it is tall.',
'Kittens begin dreaming at just over one week old.',
'Every cat\'s nose is unique, and no two nose-prints are the same.',
'The Pilgrims were the first to introduce cats to North America.',
'Cats purr to communicate.',
'A group of kittens is called a kindle.',
'The British Government owns thousands of cats, deployed in government buildings to get rid of mice.',
'Cats are more active during the evening hours.',
'Cats have a field of vision of about 185 degrees.',
'Cats have the AB blood type, which is also found in humans.',
'Cats have a homing ability that uses their biological clock, the sun\'s angle and the Earth\'s magnetic field.',
'A cat taken far from its home can return to it thanks to remarkable homing instincts.',
'Cats successfully catch mice in about one out of three attempts.',
'Female cats tend to be right pawed, while male cats are more often left pawed.',
'The first cat in space was a French cat named Felicette, sent in 1963. She survived the trip.',
'A cat can travel at a top speed of approximately 31 mph (49 km/h) over a short distance.',
'Ancient Egyptians worshipped the goddess Bast, who had a woman\'s body and a cat\'s head.',
'Cats almost never meow at each other, and mostly do so only to communicate with humans.',
'Approximately one third of cat owners think their pets are able to read their minds.',
'In Japan, cats are thought to have the power to turn into powerful spirits when they die.',
'According to Buddhist legend, the body of the cat is the temporary resting place of spiritual people.',
'A cat\'s heart beats nearly twice as fast as a human heart.',
'Cats sweat only through their paws.',
'When cats are happy or pleased, they momentarily squeeze their eyes shut.',
'Cryptocat\'s lead developer lives with a cat named Sprite. She is super cute and awesome!',
'Cats can make over one hundred different vocalizations.',
'Cats purr at a frequency that promotes bone density and helps with bone healing.'
];

CatFacts.getFact = function() {
	catFact = Math.floor(Cryptocat.random() * interestingFacts.length);
	while (lastCatFact === catFact) {
		catFact = Math.floor(Cryptocat.random() * interestingFacts.length);
	}
	lastCatFact = catFact;
	return interestingFacts[catFact];
}

})();